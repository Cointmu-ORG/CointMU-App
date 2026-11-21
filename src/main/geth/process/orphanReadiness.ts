import { callGethIpc } from "../rpc/gethIpcClient";
import { GETH_READY_MARGIN_MS, GETH_READY_WAIT_MS } from "./gethReadiness";

/**
 * When an orphaned geth (#156) can take SIGINT. Its stderr went with the app
 * and the watcher that died, so readiness comes from its IPC endpoint instead:
 * geth opens it in stack.Start, after the startup repair and after
 * GETH_READY_LOG, so an answer there means only GETH_READY_MARGIN_MS is left
 * before its SIGINT handler is in place.
 */

const IPC_PATH_FLAG = "--ipcpath";
const PROBE_METHOD = "rpc_modules";
const PROBE_TIMEOUT_MS = 2_000;
const POLL_INTERVAL_MS = 1_000;
// ps joins macOS arguments with spaces; every geth flag we pass starts with --.
const SPACED_IPC_PATH_RE = /(?:^|\s)--ipcpath\s+(.+?)(?=\s--|$)/;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * @param commandLine - The orphan's command line, NUL-separated on Linux.
 * @param platform - Selects how arguments are separated.
 * @returns Its --ipcpath, or null when it runs with IPC disabled.
 */
export function orphanIpcPath(
  commandLine: string,
  platform: NodeJS.Platform,
): string | null {
  if (platform === "linux") {
    const args = commandLine.split("\0");
    const value = args[args.indexOf(IPC_PATH_FLAG) + 1];
    return args.includes(IPC_PATH_FLAG) && value ? value : null;
  }
  return SPACED_IPC_PATH_RE.exec(commandLine.trim())?.[1] ?? null;
}

/** What awaitOrphanInterruptible needs to know about the orphan. */
export interface OrphanReadinessOptions {
  readonly ipcPath: string;
  /** False once the orphan has exited. */
  readonly isAlive: () => boolean;
  readonly waitMs?: number;
  readonly pollMs?: number;
  readonly marginMs?: number;
}

/**
 * @param options - See OrphanReadinessOptions.
 * @returns Resolves once the orphan's IPC endpoint answers plus the margin,
 *   once it has exited, or after waitMs without an answer.
 */
export async function awaitOrphanInterruptible({
  ipcPath,
  isAlive,
  waitMs = GETH_READY_WAIT_MS,
  pollMs = POLL_INTERVAL_MS,
  marginMs = GETH_READY_MARGIN_MS,
}: OrphanReadinessOptions): Promise<void> {
  const deadline = Date.now() + waitMs;
  while (isAlive()) {
    const envelope = await callGethIpc(
      ipcPath,
      PROBE_METHOD,
      [],
      PROBE_TIMEOUT_MS,
    );
    if ("result" in envelope) {
      await sleep(marginMs);
      return;
    }
    if (Date.now() >= deadline) {
      console.warn("[geth:orphan] geth never became ready; interrupting it");
      return;
    }
    await sleep(pollMs);
  }
}
