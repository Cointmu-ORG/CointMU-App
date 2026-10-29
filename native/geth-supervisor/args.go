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
	"usage: geth-supervisor run --grace-ms <ms> -- <geth> [args...]\n" +
		"       geth-supervisor interrupt <gethPid>")

// command is one parsed invocation: run geth under supervision, or interrupt
// a geth that runs without a supervisor.
type command struct {
	name  string
	pid   uint32
	grace time.Duration
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
		if len(args) < 5 || args[1] != "--grace-ms" || args[3] != "--" {
			return command{}, errUsage
		}
		graceMs, err := strconv.ParseUint(args[2], 10, 32)
		if err != nil {
			return command{}, fmt.Errorf("invalid grace period %q", args[2])
		}
		return command{
			name:  commandRun,
			grace: time.Duration(graceMs) * time.Millisecond,
			argv:  args[4:],
		}, nil
	}
	return command{}, errUsage
}
