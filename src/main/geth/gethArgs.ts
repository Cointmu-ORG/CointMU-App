import { GETH_HTTP_API_NAMESPACES } from "../security/rpcMethodPolicy";

const LOCALHOST_ADDR = "127.0.0.1";
// Host-header allow-list; blocks DNS rebinding to the local endpoint.
const HTTP_VHOSTS = "localhost,127.0.0.1";

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
