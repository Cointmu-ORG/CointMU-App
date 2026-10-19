const RPC_HOST = "127.0.0.1";
const RPC_FALLBACK_PORT = 8585;
const JSON_RPC_VERSION = "2.0";
const HEX_RADIX = 16;
const WEI_PER_GWEI = 1_000_000_000;
const WEI_PER_CMU = 1e18;
const BALANCE_DECIMAL_PLACES = 2;
const LATEST_BLOCK_TAG = "latest";

let requestCounter = 0;
let cachedRpcUrl: string | null = null;
let pendingPortResolution: Promise<string> | null = null;

/**
 * Resolves the JSON-RPC base URL of the locally running Core-geth node. The
 * dynamically allocated port is fetched once from the Electron main process via
 * the IPC bridge and cached for all subsequent calls. On a successful resolution
 * the URL is memoized; on failure the fallback port is used for the current call
 * and the resolution is retried on the next invocation.
 * @returns The fully qualified base URL of the local node HTTP endpoint.
 */
async function resolveRpcUrl(): Promise<string> {
  if (cachedRpcUrl !== null) {
    return cachedRpcUrl;
  }

  if (pendingPortResolution === null) {
    pendingPortResolution = window.api
      .getRpcPort()
      .then((resolved) => {
        const port =
          typeof resolved === "number" && resolved > 0
            ? resolved
            : RPC_FALLBACK_PORT;
        cachedRpcUrl = `http://${RPC_HOST}:${port}`;
        return cachedRpcUrl;
      })
      .catch(() => {
        pendingPortResolution = null;
        return `http://${RPC_HOST}:${RPC_FALLBACK_PORT}`;
      });
  }

  return pendingPortResolution;
}

interface RpcResponse {
  result: any;
  hasError: boolean;
  errorMessage: string | null;
}

const RPC_SUCCESS_NO_ERROR: Pick<RpcResponse, "hasError" | "errorMessage"> = {
  hasError: false,
  errorMessage: null,
};

/**
 * Performs a single JSON-RPC 2.0 call to the remote Core-geth node using the
 * native Fetch API. Returns the full RPC response including error state.
 * For read-only queries that return null on success (like miner_start),
 * callers must check hasError rather than the result value.
 * @param method - The JSON-RPC method name (e.g. 'eth_blockNumber').
 * @param params - The ordered parameter array for the method.
 * @returns An RpcResponse object with the result, error flag, and error message.
 */
async function callRaw(
  method: string,
  params: unknown[] = [],
): Promise<RpcResponse> {
  requestCounter += 1;

  const body = JSON.stringify({
    jsonrpc: JSON_RPC_VERSION,
    method,
    params,
    id: requestCounter,
  });

  try {
    const baseUrl = await resolveRpcUrl();
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      return {
        result: null,
        hasError: true,
        errorMessage: `HTTP ${response.status}`,
      };
    }

    const json = await response.json();

    if (json.error) {
      return {
        result: null,
        hasError: true,
        errorMessage: json.error.message || "Unknown RPC error",
      };
    }

    return { result: json.result, ...RPC_SUCCESS_NO_ERROR };
  } catch {
    return { result: null, hasError: true, errorMessage: "Node unreachable" };
  }
}

/**
 * Convenience wrapper around callRaw that returns only the result value
 * or null on any failure. Suitable for read-only queries where null
 * result always means failure.
 * @param method - The JSON-RPC method name.
 * @param params - The ordered parameter array.
 * @returns The raw result value, or null on failure.
 */
async function call(method: string, params: unknown[] = []): Promise<any> {
  const response = await callRaw(method, params);
  if (response.hasError) return null;
  return response.result;
}

/**
 * Fetches the latest block number from the node and converts the hex result
 * to a decimal integer.
 * @returns The block height as a number, or null on failure.
 */
async function fetchBlockNumber(): Promise<number | null> {
  const result = await call("eth_blockNumber");
  if (result === null) return null;
  return parseInt(result, HEX_RADIX);
}

/**
 * Fetches the connected peer count and converts the hex result to a decimal integer.
 * @returns The peer count as a number, or null on failure.
 */
async function fetchPeerCount(): Promise<number | null> {
  const result = await call("net_peerCount");
  if (result === null) return null;
  return parseInt(result, HEX_RADIX);
}

/**
 * Fetches the current suggested gas price and converts the hex wei result
 * to a human-readable gwei string.
 * @returns The gas price in gwei as a formatted string, or null on failure.
 */
async function fetchGasPrice(): Promise<string | null> {
  const result = await call("eth_gasPrice");
  if (result === null) return null;
  const wei = parseInt(result, HEX_RADIX);
  const gwei = Math.round(wei / WEI_PER_GWEI);
  return gwei.toString();
}

/**
 * Queries the node to check whether the internal miner is active.
 * @returns True if mining, false if idle, or null on failure.
 */
async function fetchMiningStatus(): Promise<boolean | null> {
  return await call("eth_mining");
}

/**
 * Fetches the current mining hashrate and converts the hex result to a
 * decimal integer representing hashes per second.
 * @returns The hashrate in H/s, or null on failure.
 */
async function fetchHashrate(): Promise<number | null> {
  const result = await call("eth_hashrate");
  if (result === null) return null;
  return parseInt(result, HEX_RADIX);
}

/**
 * Fetches the current network difficulty and converts the hex result
 * to a decimal integer.
 * @returns The difficulty as a number, or null on failure.
 */
async function fetchDifficulty(): Promise<number | null> {
  const result = await call("eth_getBlockByNumber", [LATEST_BLOCK_TAG, false]);
  if (result === null || result.difficulty === undefined) return null;
  return parseInt(result.difficulty, HEX_RADIX);
}

interface SyncingDto {
  startingBlock: number;
  currentBlock: number;
  highestBlock: number;
}

/**
 * Parses one hex quantity field of an eth_syncing result.
 * @param value - The raw field value from the node.
 * @returns The decimal number, or null when the field is missing or malformed.
 */
function parseHexQuantity(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = parseInt(value, HEX_RADIX);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Queries the node to check whether it is currently synchronizing with the
 * network, converting the hex block fields of the progress object to numbers.
 * @returns The sync progress if syncing, false if not syncing, or null on
 * failure or a malformed response.
 */
async function fetchSyncingStatus(): Promise<SyncingDto | false | null> {
  const result: unknown = await call("eth_syncing");
  if (result === false) return false;
  if (typeof result !== "object" || result === null) return null;

  const raw = result as Record<string, unknown>;
  const startingBlock = parseHexQuantity(raw.startingBlock);
  const currentBlock = parseHexQuantity(raw.currentBlock);
  const highestBlock = parseHexQuantity(raw.highestBlock);
  if (
    startingBlock === null ||
    currentBlock === null ||
    highestBlock === null
  ) {
    return null;
  }
  return { startingBlock, currentBlock, highestBlock };
}

/**
 * Formats a numeric CMU value into the canonical localized balance string used
 * across the wallet UI (grouped thousands, fixed two decimal places).
 * @param cmuValue - The balance value expressed in whole CMU.
 * @returns The formatted CMU string (e.g. "1,284.67").
 */
function formatBalance(cmuValue: number): string {
  return cmuValue.toLocaleString("en-US", {
    minimumFractionDigits: BALANCE_DECIMAL_PLACES,
    maximumFractionDigits: BALANCE_DECIMAL_PLACES,
  });
}

/**
 * Fetches the CMU balance for a given wallet address by calling eth_getBalance.
 * Converts the hexadecimal Wei result to CMU (divided by 1e18) and formats
 * the output to two decimal places.
 * @param address - The wallet address to query the balance for.
 * @returns The balance as a formatted CMU string (e.g. "1,284.67"), or null on failure.
 */
async function fetchBalance(address: string): Promise<string | null> {
  const result = await call("eth_getBalance", [address, LATEST_BLOCK_TAG]);
  if (result === null) return null;
  const weiValue = parseInt(result, HEX_RADIX);
  const cmuValue = weiValue / WEI_PER_CMU;
  return formatBalance(cmuValue);
}

/**
 * Sets the etherbase (coinbase) address on the remote node. This determines
 * which address receives mining rewards. Must be called before starting
 * the miner to ensure rewards are credited to the correct wallet.
 * Sends params as: [{address}]
 * @param address - The wallet address to set as the etherbase.
 * @throws Error if the RPC call fails or the node rejects the address.
 */
async function setEtherbase(address: string): Promise<void> {
  const response = await callRaw("miner_setEtherbase", [address]);
  if (response.hasError) {
    throw new Error(
      response.errorMessage || "Failed to set etherbase address on the node",
    );
  }
}

/**
 * Starts the internal miner on the remote node with the specified number
 * of mining threads. Core-geth miner_start returns null on success, so
 * we must check for RPC-level errors rather than the result value.
 * Sends params as: [{threads}] where threads is a strict integer.
 * @param threads - The number of CPU threads to allocate for mining.
 * @throws Error if the RPC call fails or the node rejects the start command.
 */
async function startMiner(threads: number): Promise<void> {
  const response = await callRaw("miner_start", [Math.floor(threads)]);
  if (response.hasError) {
    throw new Error(
      response.errorMessage || "Failed to start miner on the node",
    );
  }
}

/**
 * Stops the internal miner on the remote node. Core-geth miner_stop
 * returns null on success, so we check for RPC-level errors only.
 * @throws Error if the RPC call fails or the node rejects the stop command.
 */
async function stopMiner(): Promise<void> {
  const response = await callRaw("miner_stop");
  if (response.hasError) {
    throw new Error(
      response.errorMessage || "Failed to stop miner on the node",
    );
  }
}

/**
 * Resolves after the given number of milliseconds. Used to pace receipt polling.
 * @param ms - The delay duration in milliseconds.
 * @returns A promise that resolves once the delay elapses.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface WaitForReceiptOptions {
  confirmations?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_CONFIRMATIONS = 1;
const DEFAULT_RECEIPT_TIMEOUT_MS = 120_000;
const DEFAULT_RECEIPT_POLL_INTERVAL_MS = 2_000;
const TX_STATUS_FAILED = "0x0";

/**
 * Polls eth_getTransactionReceipt until the transaction is mined and has reached
 * the requested number of confirmations, mirroring ethers' tx.wait semantics for
 * a flow that broadcasts over raw JSON-RPC. Rejects when the transaction reverts
 * on-chain or when the timeout elapses before confirmation.
 * @param txHash - The broadcast transaction hash to wait on.
 * @param options - Optional confirmation count, timeout, and poll interval overrides.
 * @returns The confirmed transaction receipt.
 */
async function waitForTransactionReceipt(
  txHash: string,
  options: WaitForReceiptOptions = {},
): Promise<any> {
  const confirmations = options.confirmations ?? DEFAULT_CONFIRMATIONS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RECEIPT_TIMEOUT_MS;
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_RECEIPT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const receipt = await call("eth_getTransactionReceipt", [txHash]);

    if (
      receipt !== null &&
      receipt.blockNumber !== undefined &&
      receipt.blockNumber !== null
    ) {
      if (receipt.status === TX_STATUS_FAILED) {
        throw new Error("Transaction reverted on-chain.");
      }

      if (confirmations <= DEFAULT_CONFIRMATIONS) {
        return receipt;
      }

      const receiptBlock = parseInt(receipt.blockNumber, HEX_RADIX);
      const currentBlock = await fetchBlockNumber();
      if (
        currentBlock !== null &&
        currentBlock - receiptBlock + 1 >= confirmations
      ) {
        return receipt;
      }
    }

    await delay(pollIntervalMs);
  }

  throw new Error("Timed out waiting for confirmation.");
}

export {
  call,
  fetchBlockNumber,
  fetchPeerCount,
  fetchGasPrice,
  fetchMiningStatus,
  fetchHashrate,
  fetchDifficulty,
  fetchSyncingStatus,
  fetchBalance,
  formatBalance,
  waitForTransactionReceipt,
  setEtherbase,
  startMiner,
  stopMiner,
};
export type { SyncingDto };
