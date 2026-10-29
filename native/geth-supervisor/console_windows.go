package main

import (
	"errors"
	"fmt"
	"syscall"
	"time"
	"unsafe"
)

const (
	ctrlCEvent     = 0
	ctrlBreakEvent = 1
	// All processes on the console's process group 0, i.e. the whole console.
	allConsoleProcesses = 0
	// Room to see that more than geth and this process are attached.
	maxListedClients = 8
	// How long to wait for the event to reach this process too.
	ownEventTimeout = 2 * time.Second
	// A console created with CREATE_NO_WINDOW can take a moment to accept
	// AttachConsole right after CreateProcess.
	attachRetries     = 40
	attachRetryPeriod = 50 * time.Millisecond
)

var errSharedConsole = errors.New("console is shared")

// kernel32 is a KnownDLL: Windows always loads it from System32.
var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	freeConsole              = kernel32.NewProc("FreeConsole")
	attachConsole            = kernel32.NewProc("AttachConsole")
	setConsoleCtrlHandler    = kernel32.NewProc("SetConsoleCtrlHandler")
	getConsoleProcessList    = kernel32.NewProc("GetConsoleProcessList")
	generateConsoleCtrlEvent = kernel32.NewProc("GenerateConsoleCtrlEvent")
)

// joinConsole leaves this process's console, if any, and attaches to geth's.
func joinConsole(gethPid uint32, tries int) error {
	// Fails when this process has no console, which is fine.
	freeConsole.Call()
	var err error
	for range tries {
		var ok uintptr
		if ok, _, err = attachConsole.Call(uintptr(gethPid)); ok != 0 {
			return nil
		}
		time.Sleep(attachRetryPeriod)
	}
	return fmt.Errorf("cannot attach to the console of %d: %w", gethPid, err)
}

// handleConsoleEvents installs a handler that returns TRUE, so no console
// event ends this process through the default handler (which exits with
// STATUS_CONTROL_C_EXIT). os/signal does not cover this once the process has
// joined another console (measured on windows-latest).
func handleConsoleEvents(onEvent func(ctrlType uintptr)) error {
	handler := syscall.NewCallback(func(ctrlType uintptr) uintptr {
		onEvent(ctrlType)
		return 1
	})
	if ok, _, err := setConsoleCtrlHandler.Call(handler, 1); ok == 0 {
		return fmt.Errorf("cannot install a console handler: %w", err)
	}
	return nil
}

func consoleClients() []uint32 {
	list := make([]uint32, maxListedClients)
	count, _, _ := getConsoleProcessList.Call(
		uintptr(unsafe.Pointer(&list[0])), uintptr(len(list)))
	// 0 is an error; a count above the buffer size means more clients than
	// fit, and the full buffer already fails the guard.
	return list[:min(int(count), len(list))]
}

// sendBreak raises CTRL_BREAK on the console this process has joined, after
// checking that it holds geth and this process only.
func sendBreak(gethPid, selfPid uint32) error {
	clients := consoleClients()
	if !isOnlyConsoleClient(clients, gethPid, selfPid) {
		return fmt.Errorf("%w: %v", errSharedConsole, clients)
	}
	ok, _, err := generateConsoleCtrlEvent.Call(
		ctrlBreakEvent, allConsoleProcesses)
	if ok == 0 {
		return fmt.Errorf("cannot send CTRL_BREAK to %d: %w", gethPid, err)
	}
	return nil
}

func isInterruptEvent(ctrlType uintptr) bool {
	return ctrlType == ctrlCEvent || ctrlType == ctrlBreakEvent
}

// notify records an event without blocking the handler thread.
func notify(events chan<- struct{}) {
	select {
	case events <- struct{}{}:
	default:
	}
}

// awaitOwnEvent waits until the event sent to the console has reached this
// process too. Delivery is asynchronous; exiting first would race it.
func awaitOwnEvent(events <-chan struct{}) bool {
	select {
	case <-events:
		return true
	case <-time.After(ownEventTimeout):
		return false
	}
}
