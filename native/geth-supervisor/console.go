package main

import "slices"

// isOnlyConsoleClient reports whether the console holds geth and this helper
// and nothing else. A control event reaches every process on the console, so
// anything more (the app started from a terminal, a shell) must not get it.
func isOnlyConsoleClient(clients []uint32, gethPid, selfPid uint32) bool {
	return len(clients) == 2 &&
		slices.Contains(clients, gethPid) &&
		slices.Contains(clients, selfPid)
}
