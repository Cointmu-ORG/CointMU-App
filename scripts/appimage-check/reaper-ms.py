#!/usr/bin/env python3
"""Runs a command as a child subreaper and logs how every descendant ends.

Orphans (e.g. geth after the Electron main process dies) are re-parented here
instead of to init, so their exit status is observable. Linux only.
usage: reaper-ms.py <logFile> <cmd...>   (one line per reaped process:
       "<epoch> <pid> <comm> exit=<code>" or "... signal=<n>")
"""
import ctypes
import os
import subprocess
import sys
import time

PR_SET_CHILD_SUBREAPER = 36


def main() -> None:
    log_path, cmd = sys.argv[1], sys.argv[2:]
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        sys.exit(f"prctl failed: errno {ctypes.get_errno()}")
    root = subprocess.Popen(cmd)
    with open(log_path, "a", buffering=1) as log:
        log.write(f"{time.time():.3f} {root.pid} root-start\n")
        while True:
            try:
                info = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOWAIT)
            except ChildProcessError:
                return
            pid = info.si_pid
            try:
                with open(f"/proc/{pid}/comm") as f:
                    comm = f.read().strip()
            except OSError:
                comm = "?"
            os.waitpid(pid, 0)
            how = "exit" if info.si_code == os.CLD_EXITED else "signal"
            log.write(f"{time.time():.3f} {pid} {comm} {how}={info.si_status}\n")


if __name__ == "__main__":
    main()
