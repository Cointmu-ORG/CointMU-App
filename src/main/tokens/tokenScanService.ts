import { BrowserWindow } from "electron";
import { setTimeout as delay } from "node:timers/promises";
import { TOKEN_CHANNELS } from "../../bridge/ipc-channels";
import { getNetworkId } from "../geth/process/networkConfig";
import { getRpcPort } from "../geth/process/ports";
import { callGethRpcRaw } from "../geth/rpc/rpcUtils";
import type { AppStore } from "../store/appStore";
import { setActiveScanner } from "./detectedTokens";
import { TRANSFER_TOPIC, type EthCall } from "./erc20Calls";
import { TRANSFER_BATCH_TOPIC, TRANSFER_SINGLE_TOPIC } from "./erc1155";
import {
  ScanOutcome,
  TokenScanner,
  emptyScanState,
  type RawLog,
  type TokenScanRpc,
  type TokenScanState,
} from "./tokenScanner";

const BUSY_PAUSE_MS = 100;
// How often a new head is looked for; balances are only read when it moved.
const FOLLOW_INTERVAL_MS = 3_000;
const ERROR_BACKOFF_MS = 10_000;
const RPC_TIMEOUT_MS = 10_000;
const HEX_RADIX = 16;
const ADDRESS_HEX_CHARS = 40;
const TOPIC_HEX_CHARS = 64;
const STATE_KEY = "state";
// A nested array ORs topic0 across both ERC-1155 transfer events.
const ERC1155_TRANSFER_TOPICS = [TRANSFER_SINGLE_TOPIC, TRANSFER_BATCH_TOPIC];

/** The node answered with an error or something unusable. */
class TokenRpcError extends Error {
  override readonly name = "TokenRpcError";
}

async function rpcResult(method: string, params: unknown[]): Promise<unknown> {
  const envelope = await callGethRpcRaw(
    getRpcPort(),
    method,
    params,
    RPC_TIMEOUT_MS,
  );
  if ("error" in envelope) {
    throw new TokenRpcError(`${method}: ${envelope.error.message}`);
  }
  return envelope.result;
}

const toQuantity = (n: number): string => "0x" + n.toString(HEX_RADIX);
const toTopic = (address: string): string =>
  "0x" + address.slice(2).toLowerCase().padStart(TOPIC_HEX_CHARS, "0");

async function transferLogs(
  topics: Array<string | string[] | null>,
  from: number,
  to: number,
): Promise<RawLog[]> {
  const logs = await rpcResult("eth_getLogs", [
    { fromBlock: toQuantity(from), toBlock: toQuantity(to), topics },
  ]);
  if (!Array.isArray(logs)) throw new TokenRpcError("invalid logs");
  return logs;
}

/** The scanner's view of the local node, over its HTTP JSON-RPC endpoint. */
const nodeRpc: TokenScanRpc = {
  async blockNumber() {
    const head = await rpcResult("eth_blockNumber", []);
    if (typeof head !== "string") throw new TokenRpcError("invalid head");
    return parseInt(head, HEX_RADIX);
  },
  async blockHash(blockNumber) {
    const block = await rpcResult("eth_getBlockByNumber", [
      toQuantity(blockNumber),
      false,
    ]);
    const hash = (block as { hash?: unknown } | null)?.hash;
    if (typeof hash !== "string") {
      throw new TokenRpcError(`block ${blockNumber} not available`);
    }
    return hash;
  },
  transferLogsTo: (account, from, to) =>
    transferLogs([TRANSFER_TOPIC, null, toTopic(account)], from, to),
  transferLogsFrom: (account, from, to) =>
    transferLogs([TRANSFER_TOPIC, toTopic(account)], from, to),
  erc1155LogsTo: (account, from, to) =>
    transferLogs(
      [ERC1155_TRANSFER_TOPICS, null, null, toTopic(account)],
      from,
      to,
    ),
  erc1155LogsFrom: (account, from, to) =>
    transferLogs([ERC1155_TRANSFER_TOPICS, null, toTopic(account)], from, to),
  async call(to, data) {
    const envelope = await callGethRpcRaw(
      getRpcPort(),
      "eth_call",
      [{ to, data }, "latest"],
      RPC_TIMEOUT_MS,
    );
    if ("error" in envelope || typeof envelope.result !== "string") return null;
    return envelope.result;
  },
};

const isAddress = (value: unknown): value is string =>
  typeof value === "string" &&
  new RegExp(`^0x[0-9a-fA-F]{${ADDRESS_HEX_CHARS}}$`).test(value);

function walletAddresses(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];
  return accounts
    .map((account) => (account as { address?: unknown } | null)?.address)
    .filter(isAddress);
}

function loadState(raw: unknown): TokenScanState {
  const state = raw as Partial<TokenScanState> | undefined;
  if (typeof state?.accounts !== "object" || typeof state.meta !== "object") {
    return emptyScanState();
  }
  return { ...emptyScanState(), ...state } as TokenScanState;
}

const stopController = new AbortController();
let isPaused = false;
let activeState: TokenScanState | null = null;

/**
 * Forgets what the scan found (Settings → Clear cache): the next step sees
 * no genesis and scans every account from block 0 again. Custom logos and
 * hidden tokens live elsewhere and stay.
 */
export function resetTokenScan(): void {
  if (activeState) activeState.genesisHash = null;
}

/**
 * Holds the scan loop while the chain data is replaced (resync); the loop
 * keeps its state and continues once resumed.
 * @param paused - True to hold, false to resume.
 */
export function setTokenScanPaused(paused: boolean): void {
  isPaused = paused;
}

/** One scan step; @returns how long to wait before the next one. */
async function runStep(scanner: TokenScanner): Promise<number> {
  try {
    const outcome = await scanner.step();
    return outcome === ScanOutcome.BUSY ? BUSY_PAUSE_MS : FOLLOW_INTERVAL_MS;
  } catch (err) {
    console.warn("[tokens] Scan step failed:", (err as Error).message);
    return ERROR_BACKOFF_MS;
  }
}

/**
 * Starts the background ERC-20 detection for every wallet account of the
 * active network. State is saved to <userData>/token-scan-<networkId>.json
 * after each step that changed it, and windows get TOKEN_CHANNELS.CHANGED.
 * While the node is down the loop backs off and retries.
 * @param store - The app store holding the wallet accounts.
 */
export async function startTokenScan(store: AppStore): Promise<void> {
  const { default: Store } = await import("electron-store");
  const scanStore = new Store({ name: `token-scan-${getNetworkId()}` });
  const state = loadState(scanStore.get(STATE_KEY));
  activeState = state;
  const started = new TokenScanner(nodeRpc, state);
  started.setAccounts(walletAddresses(store.get("accounts")));
  store.onDidChange("accounts", (accounts: unknown) =>
    started.setAccounts(walletAddresses(accounts)),
  );
  setActiveScanner(started);

  let saved = JSON.stringify(state);
  while (!stopController.signal.aborted) {
    const pauseMs = isPaused ? FOLLOW_INTERVAL_MS : await runStep(started);
    const current = JSON.stringify(state);
    if (current !== saved) {
      saved = current;
      scanStore.set(STATE_KEY, state);
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(TOKEN_CHANNELS.CHANGED);
      }
    }
    try {
      await delay(pauseMs, undefined, { signal: stopController.signal });
    } catch {
      return;
    }
  }
}

/** Ends the scan loop (app quit). */
export function stopTokenScan(): void {
  stopController.abort();
}

/** eth_call against the local node; null on a revert or node error. */
export const nodeEthCall: EthCall = nodeRpc.call;

export { isAddress };
