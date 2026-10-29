#!/usr/bin/env bash
# AppImage signal matrix (#90): geth must shut down cleanly however the app
# ends, without depending on the AppImage's FUSE mount staying up.
# usage: run-matrix.sh <appimage> <workDir>
#   Creates a fresh test profile in <workDir>, runs every row, prints a verdict
#   table (also to $GITHUB_STEP_SUMMARY when set) and exits 1 if any row fails.
#   Needs: libfuse2, unprivileged user namespaces with capabilities, python3,
#   a display (e.g. xvfb-run). No mining, no network (loopback only).
set -u
IMG=$(realpath "$1"); W=$2
HERE=$(dirname "$(realpath "$0")")
mkdir -p "$W"; P=$(realpath "$W")/profile
node "$HERE/mkprofile.mjs" "$P" >/dev/null
copies=$P/xdg/CointMU/geth-bin
results=()

run() {
  local out
  out=$(bash "$HERE/appimage-sigtest.sh" "$P" "$IMG" "$@" 2>&1)
  echo "$out" | grep -v '^RESULT '
  results+=("$(echo "$out" | grep '^RESULT ' | tail -1)")
}

run term main TERM
run int main INT
run term2 main TERM TERM
run int2 main INT INT
run kill main KILL
run slow-term main stopgeth=3 TERM
run slow-kill main stopgeth=3 KILL
run daemon-term daemon TERM
run daemon-kill daemon KILL
run held held
# A copy changed on disk (+1 byte) must be replaced before geth runs.
copy=$(ls "$copies"/*/geth 2>/dev/null | head -1)
[ -n "$copy" ] && chmod u+w "$copy" && printf 'x' >> "$copy"
run tamper main TERM
# A noexec userData must fall back to the geth inside the mount.
export PRE_CMD="mkdir -p '$copies' && mount -t tmpfs -o noexec,mode=0700 none '$copies'"
run noexec main TERM
unset PRE_CMD
# Each geth start reports the previous run's unclean shutdown; this run catches the last one.
run check main TERM

field() { echo "$1" | tr ' ' '\n' | sed -n "s/^$2=//p"; }

# Prints why a row failed; nothing when it passed.
verdict() {
  local r=$1 label; label=$(field "$r" label)
  [ "$(field "$r" geth)" = "exit:0" ] || echo "geth $(field "$r" geth)"
  [ "$(field "$r" watcher)" = "exit:0" ] || echo "watcher $(field "$r" watcher)"
  [ "$(field "$r" sigbus)" = 0 ] || echo "SIGBUS in geth/watcher"
  [ "$(field "$r" orphan)" = no ] || echo "geth orphaned"
  [ "$(field "$r" leftovers)" = none ] || echo "leftovers $(field "$r" leftovers)"
  case $label in
    noexec) [ "$(field "$r" copy_fallback)" -ge 1 ] || echo "no fallback to the mount" ;;
    *)
      [ "$(field "$r" mount_maps)" = 0 ] || echo "geth runs from the mount"
      [ "$(field "$r" mount_env)" = 0 ] || echo "mount on geth's PATH/LD_LIBRARY_PATH" ;;
  esac
  [ "$label" = tamper ] && { [ "$(field "$r" copy_changed)" -ge 1 ] || echo "changed copy not detected"; }
  [ "$label" = check ] && { [ "$(field "$r" unclean_total)" = 0 ] || echo "$(field "$r" unclean_total) 'Unclean shutdown detected' line(s) in geth.log"; }
}

failed=0
table="| Row | geth | watcher | Verdict |\n|---|---|---|---|\n"
for r in "${results[@]}"; do
  [ -z "$r" ] && { failed=1; table+="| ? | | | FAIL: no result |\n"; continue; }
  why=$(verdict "$r" | paste -sd ';' -)
  [ -n "$why" ] && failed=1
  table+="| $(field "$r" label) | $(field "$r" geth) | $(field "$r" watcher) | ${why:+FAIL: }${why:-PASS} |\n"
done
echo; printf "%b" "$table"
[ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf "## AppImage signal matrix\n\n%b" "$table" >> "$GITHUB_STEP_SUMMARY"
exit $failed
