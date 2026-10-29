// Command geth-interrupt asks geth on Windows to shut down cleanly (#97).
//
// Node cannot interrupt a process on Windows: every kill() is a
// TerminateProcess, which leaves geth's database unclean. A console control
// event can: Go maps CTRL_BREAK to os.Interrupt, so geth runs its normal
// shutdown. The app spawns geth with windowsHide, which gives it a hidden
// console of its own; this helper joins that console and raises CTRL_BREAK
// there. CTRL_BREAK rather than CTRL_C because a process can inherit "ignore
// CTRL_C" from its parent, and nothing disables CTRL_BREAK.
//
// usage: geth-interrupt <gethPid>
// exit: 0 sent, 2 usage, 3 cannot attach, 4 console shared, 5 send failed
package main

import (
	"fmt"
	"os"
	"strconv"
	"syscall"
	"time"
	"unsafe"
)

const (
	exitUsage  = 2
	exitAttach = 3
	exitShared = 4
	exitSend   = 5

	ctrlBreakEvent = 1
	// All processes on the console's process group 0, i.e. the whole console.
	allConsoleProcesses = 0
	// Room to see that more than geth and this helper are attached.
	maxListedClients = 8
	// How long to wait for the event to reach this process too.
	ownEventTimeout = 2 * time.Second
)

// kernel32 is a KnownDLL: Windows always loads it from System32.
var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	freeConsole              = kernel32.NewProc("FreeConsole")
	attachConsole            = kernel32.NewProc("AttachConsole")
	setConsoleCtrlHandler    = kernel32.NewProc("SetConsoleCtrlHandler")
	getConsoleProcessList    = kernel32.NewProc("GetConsoleProcessList")
	generateConsoleCtrlEvent = kernel32.NewProc("GenerateConsoleCtrlEvent")
)

func fail(code int, format string, args ...any) {
	fmt.Fprintf(os.Stderr, "geth-interrupt: "+format+"\n", args...)
	os.Exit(code)
}

func consoleClients() []uint32 {
	list := make([]uint32, maxListedClients)
	count, _, _ := getConsoleProcessList.Call(
		uintptr(unsafe.Pointer(&list[0])), uintptr(len(list)))
	// 0 is an error; a count above the buffer size means more clients than
	// fit, and the full buffer already fails the guard.
	return list[:min(int(count), len(list))]
}

func main() {
	if len(os.Args) != 2 {
		fail(exitUsage, "usage: geth-interrupt <gethPid>")
	}
	pid, err := strconv.ParseUint(os.Args[1], 10, 32)
	if err != nil || pid == 0 {
		fail(exitUsage, "invalid pid %q", os.Args[1])
	}

	// Fails when this process has no console, which is fine.
	freeConsole.Call()
	if ok, _, err := attachConsole.Call(uintptr(pid)); ok == 0 {
		fail(exitAttach, "cannot attach to the console of %d: %v", pid, err)
	}

	// The event reaches this process too. A handler that returns TRUE keeps the
	// default one from ending it with STATUS_CONTROL_C_EXIT, which the caller
	// would read as a failure and kill geth mid-shutdown. os/signal does not
	// cover this (measured on windows-latest), so it is registered directly.
	ownEvent := make(chan struct{}, 1)
	handler := syscall.NewCallback(func(ctrlType uintptr) uintptr {
		select {
		case ownEvent <- struct{}{}:
		default:
		}
		return 1
	})
	if ok, _, err := setConsoleCtrlHandler.Call(handler, 1); ok == 0 {
		fail(exitAttach, "cannot install a console handler: %v", err)
	}

	clients := consoleClients()
	if !isOnlyConsoleClient(clients, uint32(pid), uint32(os.Getpid())) {
		fail(exitShared, "console of %d is shared: %v", pid, clients)
	}
	if ok, _, err := generateConsoleCtrlEvent.Call(
		ctrlBreakEvent, allConsoleProcesses); ok == 0 {
		fail(exitSend, "cannot send CTRL_BREAK to %d: %v", pid, err)
	}
	// Delivery is asynchronous; wait for it so exiting cannot race it.
	select {
	case <-ownEvent:
	case <-time.After(ownEventTimeout):
		fmt.Fprintf(os.Stderr, "geth-interrupt: sent, but the event did not come back\n")
	}
}
