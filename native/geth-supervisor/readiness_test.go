package main

import (
	"bytes"
	"errors"
	"testing"
	"time"
)

const readyLine = "INFO [11-19|21:10:33.276] Starting peer-to-peer node  instance=Geth\n"

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("broken pipe") }

func TestReadyWriterPassesTheLogOn(t *testing.T) {
	var out bytes.Buffer
	calls := 0
	w := &readyWriter{out: &out, onReady: func() { calls++ }}

	for _, chunk := range []string{"WARN Head state missing, repairing\n", readyLine, readyLine} {
		if n, err := w.Write([]byte(chunk)); err != nil || n != len(chunk) {
			t.Fatalf("Write(%q) = %d, %v", chunk, n, err)
		}
	}

	if calls != 1 {
		t.Errorf("onReady called %d times, want 1", calls)
	}
	if want := "WARN Head state missing, repairing\n" + readyLine + readyLine; out.String() != want {
		t.Errorf("out = %q", out.String())
	}
}

func TestReadyWriterFindsALineSplitAcrossWrites(t *testing.T) {
	calls := 0
	w := &readyWriter{out: &bytes.Buffer{}, onReady: func() { calls++ }}

	for _, b := range []byte(readyLine) {
		_, _ = w.Write([]byte{b})
	}

	if calls != 1 {
		t.Errorf("onReady called %d times, want 1", calls)
	}
}

func TestReadyWriterIgnoresOtherLines(t *testing.T) {
	calls := 0
	w := &readyWriter{out: &bytes.Buffer{}, onReady: func() { calls++ }}

	_, _ = w.Write([]byte("INFO Starting peer-to-peer\n"))
	_, _ = w.Write([]byte(" node? no: Starting peer-to-peer nod\n"))

	if calls != 0 {
		t.Errorf("onReady called %d times, want 0", calls)
	}
}

func TestReadyWriterKeepsReadingOnceTheAppIsGone(t *testing.T) {
	calls := 0
	w := &readyWriter{out: failingWriter{}, onReady: func() { calls++ }}

	n, err := w.Write([]byte(readyLine))

	if err != nil || n != len(readyLine) || calls != 1 {
		t.Errorf("Write = %d, %v; onReady called %d times", n, err, calls)
	}
}

func TestAwaitReady(t *testing.T) {
	never := make(chan struct{})
	closed := make(chan struct{})
	close(closed)

	if !awaitReady(closed, never, time.Hour) {
		t.Error("ready geth: want true")
	}
	if !awaitReady(never, closed, time.Hour) {
		t.Error("exited geth: want true")
	}
	if awaitReady(never, never, time.Millisecond) {
		t.Error("geth never ready: want false")
	}
}

func TestReadySignalWaitsForTheMargin(t *testing.T) {
	ready, markReady := newReadySignal()
	start := time.Now()

	markReady()
	<-ready

	if waited := time.Since(start); waited < readyMargin {
		t.Errorf("ready after %v, want at least %v", waited, readyMargin)
	}
}
