import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ms from "ms";

const INTERRUPT_HELPER = "geth-interrupt.exe";
const HELPER_TIMEOUT_MS = ms("5s");

const execFileAsync = promisify(execFile);

/**
 * @param gethBinary - The geth.exe being run.
 * @returns Where geth-interrupt.exe ships: next to geth.exe.
 */
export function interruptHelperFor(gethBinary: string): string {
  return join(dirname(gethBinary), INTERRUPT_HELPER);
}

/**
 * Asks a geth on Windows to shut down cleanly (#97). Node's kill() there is
 * always a TerminateProcess, so the helper raises CTRL_BREAK on geth's own
 * console instead (native/geth-interrupt), which geth handles like SIGINT.
 * geth must have been spawned with windowsHide so that console holds only
 * geth; the helper refuses a shared one.
 * @param pid - The geth process.
 * @param helper - The geth-interrupt.exe path.
 * @returns True once the interrupt is sent; false when it was not (helper
 *   missing, refused or failed) and geth has to be killed instead.
 */
export async function interruptGethOnWindows(
  pid: number,
  helper: string,
): Promise<boolean> {
  try {
    await execFileAsync(helper, [String(pid)], {
      timeout: HELPER_TIMEOUT_MS,
      windowsHide: true,
    });
    return true;
  } catch (err) {
    console.warn(
      `[geth:stop] Could not interrupt geth ${pid}; killing it instead:`,
      err,
    );
    return false;
  }
}
