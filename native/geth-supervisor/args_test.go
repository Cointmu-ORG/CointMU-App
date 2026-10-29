package main

import (
	"slices"
	"testing"
	"time"
)

func TestParseRun(t *testing.T) {
	got, err := parseArgs([]string{
		"run", "--grace-ms", "15000", "--", `C:\a b\geth.exe`, "--datadir", `C:\d`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.name != commandRun || got.grace != 15*time.Second ||
		!slices.Equal(got.argv, []string{`C:\a b\geth.exe`, "--datadir", `C:\d`}) {
		t.Errorf("got %+v", got)
	}
}

func TestParseInterrupt(t *testing.T) {
	got, err := parseArgs([]string{"interrupt", "4242"})
	if err != nil {
		t.Fatal(err)
	}
	if got.name != commandInterrupt || got.pid != 4242 {
		t.Errorf("got %+v", got)
	}
}

func TestParseRejects(t *testing.T) {
	cases := [][]string{
		nil,
		{"start"},
		{"interrupt"},
		{"interrupt", "0"},
		{"interrupt", "-1"},
		{"interrupt", "12", "13"},
		{"run", "--grace-ms", "15000", "--"},
		{"run", "--grace-ms", "15000", "geth.exe"},
		{"run", "--grace-ms", "soon", "--", "geth.exe"},
		{"run", "--", "geth.exe"},
	}
	for _, args := range cases {
		if _, err := parseArgs(args); err == nil {
			t.Errorf("%q: accepted", args)
		}
	}
}
