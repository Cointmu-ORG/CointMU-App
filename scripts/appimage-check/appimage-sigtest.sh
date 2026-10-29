#!/usr/bin/env bash
# One run of the AppImage signal matrix: starts the AppImage in nsfuse.sh's
# namespace under reaper-ms.py, waits for geth, then signals the main process or
# the FUSE daemon and records how geth and its watcher end.
# usage: appimage-sigtest.sh <profileDir> <appimage> <label> <target> [stopgeth=<sec>] [signal...]
#   target main | daemon: send the signals (150 ms apart) to that process.
#   target held: SIGSTOP geth, SIGKILL main, SIGKILL the FUSE daemon, SIGCONT
#     geth 3 s later (geth shuts down after its mount is gone).
#   stopgeth=<sec>: SIGSTOP geth before the signals and SIGCONT it <sec> later
#     (a geth whose shutdown outlasts the main process).
#   PRE_CMD (env): shell command run inside the namespace before the app.
# Last line: "RESULT label=… geth=… watcher=… …" (see run-matrix.sh).
set -u
P=$(realpath "$1"); IMG=$(realpath "$2"); L=$3; TARGET=$4; shift 4
HOLD_S=0; case "${1:-}" in stopgeth=*) HOLD_S=${1#stopgeth=}; shift ;; esac
[ "$TARGET" = held ] && HOLD_S=3
readonly TEST_CHAIN_ID=19129 GETH_START_TIMEOUT_S=180 SETTLE_S=20 GETH_EXIT_TIMEOUT_S=60 TEARDOWN_TIMEOUT_S=30
HERE=$(dirname "$(realpath "$0")")
log=$P/reap-$L.log; applog=$P/app-$L.log; rm -f "$log"
gethlog=$P/xdg/CointMU/logs/geth.log

GETH_NETWORK_ID=$TEST_CHAIN_ID GETH_LOG_VERBOSITY=4 "$HERE/nsfuse.sh" "$P" "$L" sh -c "${PRE_CMD:-true} && exec \"\$@\"" sh \
  python3 "$HERE/reaper-ms.py" "$log" "$IMG" --remote-debugging-port=9333
holder=$(cat "$P/ns-$L.pid")

g=
for _ in $(seq 1 $GETH_START_TIMEOUT_S); do
  g=$(pgrep -f -- "--networkid $TEST_CHAIN_ID --datadir $P/" | head -1); [ -n "$g" ] && break; sleep 1
done
if [ -z "$g" ]; then
  echo "$L: geth never started"; tail -20 "$applog"
  echo "RESULT label=$L geth=never-started"; exit 1
fi
sleep $SETTLE_S

main=$(awk '/root-start/ {print $2}' "$log")
ns=$(readlink /proc/$holder/ns/net)
in_ns() { for p in /proc/[0-9]*; do [ "$(readlink $p/ns/net 2>/dev/null)" = "$ns" ] && echo ${p#/proc/}; done; }
daemon=$(for p in $(in_ns); do [ "$(cat /proc/$p/comm 2>/dev/null)" = "$(basename "$IMG" | cut -c1-15)" ] && echo $p; done | head -1)
w=$(pgrep -f "cointmu-geth-watcher $g" | head -1); [ -z "$w" ] && w=$(pgrep -f "gethWatcher.js $g" | head -1)
mnt=$(dirname "$(readlink /proc/$main/exe)")
mount_maps=$(awk '$6 ~ /^\// {print $6}' /proc/$g/maps | sort -u | grep -c "^$mnt/")
mount_env=$(tr '\0' '\n' < /proc/$g/environ | grep -E '^(PATH|LD_LIBRARY_PATH)=' | grep -c "$mnt")
echo "$L: main=$main daemon=${daemon:-none} geth=$g watcher=${w:-none}"
echo "$L: geth exe=$(readlink /proc/$g/exe) files mapped from the mount=$mount_maps"
echo "$L: watcher exe=$([ -n "$w" ] && readlink /proc/$w/exe)"

date +"%s.%3N signal-start" >> "$log"
if [ "$TARGET" = held ]; then
  kill -STOP $g; kill -KILL $main; sleep 0.5; kill -KILL $daemon
else
  case $TARGET in main) tp=$main ;; daemon) tp=$daemon ;; esac
  [ "$HOLD_S" != 0 ] && kill -STOP $g
  for s in "$@"; do kill -s $s $tp; sleep 0.15; done
fi
if [ "$HOLD_S" != 0 ]; then sleep "$HOLD_S"; date +"%s.%3N geth-SIGCONT" >> "$log"; kill -CONT $g; fi

for _ in $(seq 1 $GETH_EXIT_TIMEOUT_S); do kill -0 $g 2>/dev/null || break; sleep 1; done
orphan=no; kill -0 $g 2>/dev/null && orphan=yes
for _ in $(seq 1 $TEARDOWN_TIMEOUT_S); do kill -0 $holder 2>/dev/null || break; sleep 1; done
leftovers=none
if kill -0 $holder 2>/dev/null; then
  leftovers=$(for p in $(in_ns); do [ $p != $holder ] && echo -n "$p:$(cat /proc/$p/comm),"; done)
  for p in $(in_ns); do kill -9 $p 2>/dev/null; done; sleep 2
fi

awk -v m=$main -v d="$daemon" -v g=$g -v w="$w" -v L=$L '
  /signal-start|geth-SIGCONT/ {print L"   "$0; next}
  $2==g {print L" geth:    "$0; next} $2==m {print L" main:    "$0; next}
  $2==d {print L" daemon:  "$0; next} $2==w {print L" watcher: "$0; next}
  /root-start/ {next} {print L" other:   "$0}' "$log"
grep -E '\[geth:copy\]' "$applog" | sed "s/^/$L app: /" | cut -c1-200

status() { awk -v p="$1" '$2==p {sub(/=/, ":", $4); print $4}' "$log"; }
own_sigbus=$(awk -v g=$g -v w="$w" '($2==g || $2==w) && /signal=7/' "$log" | wc -l)
copy_changed=$(grep -c '\[geth:copy\].*has changed' "$applog")
copy_fallback=$(grep -c '\[geth:copy\] Cannot run geth from a copy' "$applog")
unclean=$(grep -c "Unclean shutdown detected" "$gethlog" 2>/dev/null)
echo "RESULT label=$L geth=$(status $g) watcher=$(status "$w") sigbus=$own_sigbus orphan=$orphan" \
  "leftovers=${leftovers:-none} mount_maps=$mount_maps mount_env=$mount_env" \
  "copy_changed=$copy_changed copy_fallback=$copy_fallback unclean_total=${unclean:-0}"
