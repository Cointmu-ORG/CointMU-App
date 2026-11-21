// Command geth-supervisor runs geth on Windows so that it always shuts down
// cleanly (#97).
//
// Node cannot interrupt a process on Windows: every kill() is a
// TerminateProcess, which leaves geth's database unclean. And libuv puts every
// child it spawns without "detached" into a KILL_ON_JOB_CLOSE job, so when the
// app's main process dies, Windows terminates geth at once. The app therefore
// spawns this supervisor detached (outside that job), and it runs geth.
//
// run: starts geth with a hidden console of its own (CREATE_NO_WINDOW) and
// the supervisor's stdout, which is the app's pipe. geth's stderr (its log)
// passes through the supervisor on to the app; the supervisor reads it to
// tell when geth is ready (readiness.go). stdin is a pipe the app holds. When it closes (the
// app stops geth, or the app is gone), the supervisor waits until geth is
// ready (at most the ready wait), then raises CTRL_BREAK on geth's console,
// which Go maps to os.Interrupt, so geth shuts down; after the grace period it
// terminates geth. geth runs in a KILL_ON_JOB_CLOSE job of
// the supervisor's, so it never outlives it. The supervisor exits with geth's
// exit code once geth is gone.
//
// interrupt: raises CTRL_BREAK once on the console of a geth that runs
// without a supervisor (one left by an older version), then exits.
//
// CTRL_BREAK rather than CTRL_C because a process can inherit "ignore CTRL_C"
// from its parent, and nothing disables CTRL_BREAK.
//
// usage: geth-supervisor run --grace-ms <ms> --ready-wait-ms <ms> -- <geth> [args...]
//
//	geth-supervisor interrupt <gethPid>
//
// exit (interrupt, or run before geth started): 0 sent, 2 usage, 3 cannot
// attach, 4 console shared, 5 send failed, 6 geth did not start.
package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const (
	exitUsage  = 2
	exitAttach = 3
	exitShared = 4
	exitSend   = 5
	exitStart  = 6

	createNoWindow = 0x08000000
)

func warn(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "geth-supervisor: "+format+"\n", args...)
}

func main() {
	c, err := parseArgs(os.Args[1:])
	if err != nil {
		warn("%v", err)
		os.Exit(exitUsage)
	}
	if c.name == commandInterrupt {
		os.Exit(interrupt(c.pid))
	}
	os.Exit(run(c))
}

func interrupt(gethPid uint32) int {
	if err := joinConsole(gethPid, 1); err != nil {
		warn("%v", err)
		return exitAttach
	}
	ownEvent := make(chan struct{}, 1)
	if err := handleConsoleEvents(func(uintptr) { notify(ownEvent) }); err != nil {
		warn("%v", err)
		return exitAttach
	}
	if err := sendBreak(gethPid, uint32(os.Getpid())); err != nil {
		warn("%v", err)
		if errors.Is(err, errSharedConsole) {
			return exitShared
		}
		return exitSend
	}
	if !awaitOwnEvent(ownEvent) {
		warn("sent, but the event did not come back")
	}
	return 0
}

// startGeth starts geth in a job it cannot outlive; see run.
func startGeth(argv []string, onReady func()) (*exec.Cmd, error) {
	geth := exec.Command(argv[0], argv[1:]...)
	geth.Stdout = os.Stdout
	geth.Stderr = &readyWriter{out: os.Stderr, onReady: onReady}
	geth.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindow,
		HideWindow:    true,
	}
	if err := geth.Start(); err != nil {
		return nil, err
	}
	if err := dieWithThisProcess(uint32(geth.Process.Pid)); err != nil {
		warn("%v; geth can outlive the supervisor", err)
	}
	return geth, nil
}

func run(c command) int {
	ready, markReady := newReadySignal()
	geth, err := startGeth(c.argv, markReady)
	if err != nil {
		warn("cannot start geth: %v", err)
		return exitStart
	}
	gethPid := uint32(geth.Process.Pid)

	exitCode := make(chan int, 1)
	gone := make(chan struct{})
	go func() {
		// A wait error leaves ProcessState nil; -1 marks it.
		err := geth.Wait()
		code := -1
		if geth.ProcessState != nil {
			code = geth.ProcessState.ExitCode()
		} else {
			warn("waiting for geth: %v", err)
		}
		exitCode <- code
		close(gone)
	}()

	ownEvent := make(chan struct{}, 1)
	canInterrupt := joinGethConsole(gethPid, c.grace, gone, ownEvent)

	stop := make(chan struct{})
	go func() {
		// End of file or a broken pipe: the app wants geth stopped, or is gone.
		_, _ = io.Copy(io.Discard, os.Stdin)
		close(stop)
	}()

	select {
	case code := <-exitCode:
		return code
	case <-stop:
	}
	if !awaitReady(ready, gone, c.readyWait) {
		warn("geth is not ready after %v; interrupting it anyway", c.readyWait)
	}
	select {
	case code := <-exitCode:
		return code
	default:
	}
	stopGeth(geth, gethPid, canInterrupt, ownEvent)
	select {
	case code := <-exitCode:
		return code
	case <-time.After(c.grace):
		warn("geth %d is still running after %v; killing it", gethPid, c.grace)
		_ = geth.Process.Kill()
	}
	return <-exitCode
}

// joinGethConsole attaches to geth's console for the supervisor's whole life,
// so it also sees the logoff and shutdown events geth gets. For those it holds
// the session up until geth has exited or the grace period is over; geth
// shuts down on them by itself (Go maps them to SIGTERM).
func joinGethConsole(
	gethPid uint32,
	grace time.Duration,
	gone <-chan struct{},
	ownEvent chan<- struct{},
) bool {
	if err := joinConsole(gethPid, attachRetries); err != nil {
		warn("%v; geth will be killed instead of interrupted", err)
		return false
	}
	err := handleConsoleEvents(func(ctrlType uintptr) {
		if isInterruptEvent(ctrlType) {
			notify(ownEvent)
			return
		}
		select {
		case <-gone:
		case <-time.After(grace):
		}
	})
	if err != nil {
		warn("%v; geth will be killed instead of interrupted", err)
		return false
	}
	return true
}

func stopGeth(
	geth *exec.Cmd,
	gethPid uint32,
	canInterrupt bool,
	ownEvent <-chan struct{},
) {
	if canInterrupt {
		err := sendBreak(gethPid, uint32(os.Getpid()))
		if err == nil {
			if !awaitOwnEvent(ownEvent) {
				warn("sent, but the event did not come back")
			}
			return
		}
		warn("%v; killing geth", err)
	}
	_ = geth.Process.Kill()
}
