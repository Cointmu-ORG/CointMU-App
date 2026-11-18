import type { DetectedTokens } from "../../bridge/types";
import type { TokenMeta } from "./erc20Calls";
import type { TokenScanner } from "./tokenScanner";

// Kept apart from tokenScanService (electron, geth config) so IPC handlers
// and the activity scan can read results without those imports.
let scanner: TokenScanner | null = null;

/** Called once by the scan service when its scanner starts. */
export function setActiveScanner(started: TokenScanner): void {
  scanner = started;
}

/** @returns The account's detected tokens with a balance, and its scan progress. */
export function getDetectedTokens(account: string): DetectedTokens {
  if (scanner === null) {
    return {
      tokens: [],
      scan: { scannedBlock: 0, headBlock: null, isComplete: false },
    };
  }
  return scanner.snapshot(account);
}

/** @returns Metadata of a contract the scan detected, for activity rows. */
export function detectedTokenMeta(contract: string): TokenMeta | undefined {
  return scanner?.tokenMeta(contract);
}
