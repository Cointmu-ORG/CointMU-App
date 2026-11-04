import { LogLevel } from "../../../bridge/setting-values";
import { GETH_HTTP_API_NAMESPACES } from "../../security/rpcMethodPolicy";

const LOCALHOST_ADDR = "127.0.0.1";
// Host-header allow-list; blocks DNS rebinding to the local endpoint.
const HTTP_VHOSTS = "localhost,127.0.0.1";
// The store default (appStore.ts); also used for a stored value that is not a count.
const DEFAULT_MAX_PEERS = 14;
// geth --verbosity: 3 = info, 4 = debug.
const INFO_VERBOSITY = "3";
const DEBUG_VERBOSITY = "4";

/**
 * Builds the peer limit flag from the Max peers setting.
 * @param maxPeers - The stored network.maxPeers value.
 * @returns --maxpeers with the stored count, or the default when it is not a
 * positive whole number.
 */
export function buildGethPeerArgs(maxPeers: unknown): string[] {
  const isCount =
    typeof maxPeers === "number" && Number.isInteger(maxPeers) && maxPeers > 0;
  return ["--maxpeers", String(isCount ? maxPeers : DEFAULT_MAX_PEERS)];
}

/**
 * Picks geth's --verbosity from the Log level setting. Never below info: the
 * mining log, the DAG progress and the recovery classifier read geth's INFO
 * lines, so a stored warn or error level (offered up to 1.7.4) runs at info.
 * @param logLevel - The stored advanced.logLevel value.
 * @param envVerbosity - GETH_LOG_VERBOSITY, which wins for development and CI.
 * @returns The --verbosity value.
 */
export function resolveGethVerbosity(
  logLevel: unknown,
  envVerbosity: string | undefined,
): string {
  if (envVerbosity) return envVerbosity;
  return logLevel === LogLevel.DEBUG ? DEBUG_VERBOSITY : INFO_VERBOSITY;
}

/**
 * Builds the geth HTTP flags. No --http.corsdomain: browsers get no CORS
 * header, so web pages cannot read the node; the app reaches it from the main
 * process instead.
 * @param port - The HTTP port.
 * @returns The flag list.
 */
export function buildGethHttpArgs(port: number): string[] {
  return [
    "--http",
    "--http.addr",
    LOCALHOST_ADDR,
    "--http.port",
    String(port),
    "--http.api",
    GETH_HTTP_API_NAMESPACES,
    "--http.vhosts",
    HTTP_VHOSTS,
  ];
}

/**
 * Builds the geth IPC flags.
 * @param ipcPath - The private endpoint, or null when none could be prepared.
 * @returns --ipcpath for a private endpoint, otherwise --ipcdisable so geth
 * never falls back to its default location.
 */
export function buildGethIpcArgs(ipcPath: string | null): string[] {
  return ipcPath === null ? ["--ipcdisable"] : ["--ipcpath", ipcPath];
}
