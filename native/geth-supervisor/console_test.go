package main

import "testing"

func TestIsOnlyConsoleClient(t *testing.T) {
	const geth, self = 100, 200
	cases := []struct {
		name    string
		clients []uint32
		want    bool
	}{
		{"geth and helper", []uint32{geth, self}, true},
		{"either order", []uint32{self, geth}, true},
		{"helper alone", []uint32{self}, false},
		{"another process too", []uint32{geth, self, 300}, false},
		{"another process instead of geth", []uint32{300, self}, false},
	}
	for _, c := range cases {
		if got := isOnlyConsoleClient(c.clients, geth, self); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
