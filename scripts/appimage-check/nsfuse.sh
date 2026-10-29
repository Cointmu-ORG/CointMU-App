#!/usr/bin/env bash
# Runs a command (the AppImage) in its own user, mount and network namespace.
# The AppImage runtime must mount FUSE, which setuid fusermount cannot do inside
# a user namespace that does not map root. This one maps our uid to itself, has
# its own mount namespace (the FUSE mount is invisible outside), only loopback
# (it refuses to start if any route exists), and keeps the namespace's
# capabilities as ambient caps so the runtime can mount(2) FUSE directly. The
# caps only apply inside the namespace; the app still runs as our uid.
# usage: nsfuse.sh <profileDir> <tag> <cmd...>
#   Runs in the background; output in <profileDir>/app-<tag>.log, holder pid in
#   <profileDir>/ns-<tag>.pid. XDG_CONFIG_HOME and HOME point into the profile.
set -euo pipefail
dir=$(realpath "$1"); tag=$2; shift 2
setsid unshare -U -n -m --map-user="$(id -u)" --map-group="$(id -g)" --keep-caps \
  sh -c 'ip link set lo up && [ -z "$(ip route)" ] || { echo "namespace has a route; refusing" >&2; exit 1; }; exec "$@"' sh \
  env XDG_CONFIG_HOME="$dir/xdg" HOME="$dir/home" "$@" </dev/null >"$dir/app-$tag.log" 2>&1 &
echo $! > "$dir/ns-$tag.pid"
