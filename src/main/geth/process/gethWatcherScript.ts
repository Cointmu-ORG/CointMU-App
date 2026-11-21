import { GETH_READY_LOG } from "./gethReadiness";

/**
 * The geth watcher outside Windows (#73, #90): a POSIX sh script for the
 * system's /bin/sh, doing the job of gethWatcher.ts. It runs only system
 * binaries (sh, cat, grep, sleep), so nothing it needs lives on the AppImage's
 * FUSE mount, which can go away once the main process is gone, and it does not
 * depend on Electron's RunAsNode fuse.
 *
 * - stdin is a pipe the main process holds; end-of-file means it is gone, and
 *   the watcher sends geth SIGINT, then SIGKILL after the grace period.
 * - geth dies at once on a SIGINT before it has logged GETH_READY_LOG (#101,
 *   see gethReadiness.ts). The main process writes a line to stdin once geth
 *   has logged it; without that line the watcher first reads geth's stderr
 *   until the line appears, geth exits or the ready wait is over.
 * - fds 3 and 4 are geth's stdout and stderr pipes; it drains them once the
 *   main process is gone, or geth's next log line fails with SIGPIPE. They are
 *   non-blocking sockets shared with the main process (libuv sets the flag on
 *   the shared file description), so cat stops with EAGAIN whenever geth has
 *   written nothing new; drain restarts it until geth closes its end.
 * - It ends once geth exits on its own, so it never signals a reused PID.
 *
 * It polls once a second (`sleep 1` is the portable minimum), so it reacts
 * within 1 s. Until then it holds geth's output pipes open: a geth that keeps
 * logging blocks on a full pipe rather than dying of SIGPIPE.
 * usage: /bin/sh -c "$GETH_WATCHER_SH" <name> <gethPid> <gracefulTimeoutMs>
 *   <readyWaitMs>
 */
export const GETH_WATCHER_SH = `
geth=$1
grace_ms=$2
ready_wait_ms=$3
ready_log='${GETH_READY_LOG}'
case $geth in ''|0*|*[!0-9]*) exit 2 ;; esac
case $grace_ms in ''|*[!0-9]*) exit 2 ;; esac
case $ready_wait_ms in ''|*[!0-9]*) exit 2 ;; esac

# Ctrl+C or a logout signals the whole process group; the watcher must outlive
# the main process. Its children (cat, sleep) inherit this.
trap '' INT TERM HUP

is_alive() { kill -0 "$1" 2>/dev/null; }

# The job ends when the OS closes the main process's pipe: with status 0 when
# the main process had reported geth ready (a line), 1 when it had not. A
# background job gets /dev/null as its stdin, so the pipe moves to fd 5 first.
exec 5<&0 0</dev/null
(read -r line || exit 1; exec cat >/dev/null) <&5 3<&- 4<&- &
main_pipe=$!
exec 5<&-

# cat exits 0 at end-of-file, i.e. once geth has exited. The fallback to a
# whole second covers a sleep that only takes integers (strict POSIX).
drain() {
  until cat >/dev/null 2>&1; do
    is_alive "$geth" || return 0
    sleep 0.1 2>/dev/null || sleep 1
  done
}

# Reads geth's stderr (stdin) until geth has logged $ready_log, has exited,
# or $ready_wait_ms is over; then waits out the margin (GETH_READY_MARGIN_MS).
# grep stops with EAGAIN whenever geth has written nothing new, like cat.
await_ready() {
  ticks=$(( (ready_wait_ms + 999) / 1000 ))
  until grep -q -F -e "$ready_log" 2>/dev/null; do
    is_alive "$geth" || return 0
    [ "$ticks" -le 0 ] && return 0
    ticks=$((ticks - 1))
    sleep 1
  done
  sleep 1
}

stop_geth() {
  drain <&3 4<&- &
  # The shell keeps the status of a reaped job for wait.
  if wait "$main_pipe"; then
    # Reported ready, but maybe within the margin.
    sleep 1
  else
    await_ready <&4 3<&-
  fi
  drain <&4 3<&- &
  exec 3<&- 4<&-
  kill -INT "$geth" 2>/dev/null
  ticks=$(( (grace_ms + 999) / 1000 ))
  while is_alive "$geth"; do
    if [ "$ticks" -le 0 ]; then
      kill -KILL "$geth" 2>/dev/null
      break
    fi
    ticks=$((ticks - 1))
    sleep 1
  done
  exit 0
}

# The shell reaps the ended cat while it waits for sleep, so is_alive sees it.
while is_alive "$geth"; do
  is_alive "$main_pipe" || stop_geth
  sleep 1
done
# geth exited on its own (restart, normal quit). The job ignores SIGTERM like
# this shell, and would otherwise hold the pipe until the main process exits.
kill -KILL "$main_pipe" 2>/dev/null
exit 0
`;
