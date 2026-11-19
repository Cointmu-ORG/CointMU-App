/**
 * When geth can take an interrupt (#101). geth 1.10.26 installs its SIGINT
 * handler only after the node has started: makeFullNode (which runs the
 * startup repair, "Head state missing, repairing") comes first, then
 * stack.Start, then signal.Notify. Until then an interrupt (SIGINT, or
 * CTRL_BREAK on Windows) ends geth at once, and its next start rewinds the
 * chain. So every stopper waits for this before it interrupts geth.
 */

/** The first line geth logs in stack.Start, i.e. after makeFullNode. */
export const GETH_READY_LOG = "Starting peer-to-peer node";
/** Covers the rest of stack.Start up to signal.Notify (measured: a few ms). */
export const GETH_READY_MARGIN_MS = 1_000;
/**
 * How long a stop waits for a geth that is still starting (a repair can take
 * minutes) before it interrupts it anyway.
 */
export const GETH_READY_WAIT_MS = 300_000;

/** Tracks one geth's startup from its log. */
export interface GethReadiness {
  /** Feeds one complete geth log line. */
  observe(line: string): void;
  /** @returns True once geth has logged GETH_READY_LOG. */
  isReady(): boolean;
  /** Ends every wait: geth has exited. */
  release(): void;
  /**
   * @param waitMs - The cap on waiting for GETH_READY_LOG.
   * @returns Resolves once GETH_READY_MARGIN_MS has passed since
   *   GETH_READY_LOG, after waitMs without it, or on release.
   */
  untilInterruptible(waitMs?: number): Promise<void>;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * @param onReady - Called once, when geth logs GETH_READY_LOG.
 * @returns The readiness of a geth just spawned.
 */
export function createGethReadiness(
  onReady: () => void = () => {},
): GethReadiness {
  let readyAt: number | null = null;
  let isReleased = false;
  const waiters = new Set<() => void>();
  const wakeAll = (): void => {
    waiters.forEach((wake) => wake());
  };

  const awaitReadyLog = (waitMs: number): Promise<void> =>
    new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, waitMs);
      waiters.add(wake);
    });

  return {
    observe(line) {
      if (readyAt !== null || !line.includes(GETH_READY_LOG)) return;
      readyAt = Date.now();
      onReady();
      wakeAll();
    },
    isReady: () => readyAt !== null,
    release() {
      isReleased = true;
      wakeAll();
    },
    async untilInterruptible(waitMs = GETH_READY_WAIT_MS) {
      if (readyAt === null && !isReleased) await awaitReadyLog(waitMs);
      if (readyAt === null || isReleased) return;
      const remainingMs = readyAt + GETH_READY_MARGIN_MS - Date.now();
      if (remainingMs > 0) await sleep(remainingMs);
    },
  };
}
