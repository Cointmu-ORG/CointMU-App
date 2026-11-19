package main

import (
	"errors"
	"fmt"
	"strconv"
	"time"
)

const (
	commandRun       = "run"
	commandInterrupt = "interrupt"
)

var errUsage = errors.New(
	"usage: geth-supervisor run --grace-ms <ms> --ready-wait-ms <ms> -- <geth> [args...]\n" +
		"       geth-supervisor interrupt <gethPid>")

// command is one parsed invocation: run geth under supervision, or interrupt
// a geth that runs without a supervisor.
type command struct {
	name  string
	pid   uint32
	grace time.Duration
	// How long a stop waits for geth to become ready (see readiness.go).
	readyWait time.Duration
	// The geth executable followed by its arguments.
	argv []string
}

func parseArgs(args []string) (command, error) {
	if len(args) == 0 {
		return command{}, errUsage
	}
	switch args[0] {
	case commandInterrupt:
		if len(args) != 2 {
			return command{}, errUsage
		}
		pid, err := strconv.ParseUint(args[1], 10, 32)
		if err != nil || pid == 0 {
			return command{}, fmt.Errorf("invalid pid %q", args[1])
		}
		return command{name: commandInterrupt, pid: uint32(pid)}, nil
	case commandRun:
		return parseRun(args)
	}
	return command{}, errUsage
}

func parseRun(args []string) (command, error) {
	if len(args) < 7 || args[1] != "--grace-ms" ||
		args[3] != "--ready-wait-ms" || args[5] != "--" {
		return command{}, errUsage
	}
	grace, err := parseMs(args[2])
	if err != nil {
		return command{}, fmt.Errorf("invalid grace period %q", args[2])
	}
	readyWait, err := parseMs(args[4])
	if err != nil {
		return command{}, fmt.Errorf("invalid ready wait %q", args[4])
	}
	return command{
		name:      commandRun,
		grace:     grace,
		readyWait: readyWait,
		argv:      args[6:],
	}, nil
}

func parseMs(text string) (time.Duration, error) {
	ms, err := strconv.ParseUint(text, 10, 32)
	return time.Duration(ms) * time.Millisecond, err
}
