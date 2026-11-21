package main

import (
	"bytes"
	"io"
	"time"
)

// geth 1.10.26 installs its interrupt handler only after the node has
// started: makeFullNode (which runs the startup repair) comes first, then
// stack.Start, then signal.Notify. Until then CTRL_BREAK ends geth at once,
// and its next start rewinds the chain (#101). So the supervisor interrupts
// geth only once it is ready; src/main/geth/process/gethReadiness.ts holds the
// same values.
const (
	// The first line geth logs in stack.Start, i.e. after makeFullNode.
	gethReadyLog = "Starting peer-to-peer node"
	// Covers the rest of stack.Start up to signal.Notify (measured: a few ms).
	readyMargin = time.Second
)

// readyWriter passes geth's stderr on to out and calls onReady once geth has
// logged gethReadyLog. It never fails: once the app is gone, out (the app's
// pipe) fails, and geth's log still has to be read or geth blocks on it.
type readyWriter struct {
	out     io.Writer
	onReady func()
	// The end of the log so far, for a line split across writes.
	tail    []byte
	isReady bool
}

func (w *readyWriter) Write(p []byte) (int, error) {
	// Nothing reads a write error here; see the type comment.
	_, _ = w.out.Write(p)
	if w.isReady {
		return len(p), nil
	}
	seen := append(w.tail, p...)
	if bytes.Contains(seen, []byte(gethReadyLog)) {
		w.isReady = true
		w.tail = nil
		w.onReady()
		return len(p), nil
	}
	keep := min(len(seen), len(gethReadyLog)-1)
	w.tail = append(w.tail[:0], seen[len(seen)-keep:]...)
	return len(p), nil
}

// newReadySignal returns a channel that closes readyMargin after the returned
// function is first called.
func newReadySignal() (<-chan struct{}, func()) {
	ready := make(chan struct{})
	return ready, func() {
		time.AfterFunc(readyMargin, func() { close(ready) })
	}
}

// awaitReady waits until geth can take an interrupt, has exited, or wait is
// over. It returns false in the last case.
func awaitReady(ready, gone <-chan struct{}, wait time.Duration) bool {
	select {
	case <-ready:
	case <-gone:
	case <-time.After(wait):
		return false
	}
	return true
}
