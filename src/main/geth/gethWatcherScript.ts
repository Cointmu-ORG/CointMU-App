/**
 * The geth watcher outside Windows (#73, #90): a POSIX sh script for the
 * system's /bin/sh, doing the job of gethWatcher.ts. It runs only system
 * binaries (sh, cat, sleep), so nothing it needs lives on the AppImage's FUSE
 * mount, which can go away once the main process is gone, and it does not
 * depend on Electron's RunAsNode fuse.
 *
 * - stdin is a pipe the main process holds; end-of-file means it is gone, and
 *   the watcher sends geth SIGINT, then SIGKILL after the grace period.
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
 */
export const GETH_WATCHER_SH = `
geth=$1
grace_ms=$2
case $geth in ''|0*|*[!0-9]*) exit 2 ;; esac
case $grace_ms in ''|*[!0-9]*) exit 2 ;; esac

# Ctrl+C or a logout signals the whole process group; the watcher must outlive
# the main process. Its children (cat, sleep) inherit this.
trap '' INT TERM HUP

is_alive() { kill -0 "$1" 2>/dev/null; }

# cat ends when the OS closes the main process's pipe. A background job gets
# /dev/null as its stdin, so the pipe moves to fd 5 first.
exec 5<&0 0</dev/null
cat <&5 >/dev/null 3<&- 4<&- &
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

stop_geth() {
  drain <&3 4<&- &
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
# geth exited on its own (restart, normal quit). cat ignores SIGTERM like
# this shell, and would otherwise hold the pipe until the main process exits.
kill -KILL "$main_pipe" 2>/dev/null
exit 0
`;
