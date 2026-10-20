import detectPort from "detect-port";

const MAX_PORT_SCAN_ATTEMPTS = 50;

const DEFAULT_RPC_PORT = parseInt(process.env.GETH_HTTP_PORT || "8585", 10);
// Geth always opens the engine (auth) RPC; its fixed default 8551 collides
// with any other node on the machine, so it is scanned like the HTTP port.
const DEFAULT_AUTH_RPC_PORT = 8551;

let resolvedRpcPort: number = DEFAULT_RPC_PORT;
let resolvedAuthRpcPort: number = DEFAULT_AUTH_RPC_PORT;

/** @returns The geth HTTP RPC port chosen at startup (the default until then). */
export function getRpcPort(): number {
  return resolvedRpcPort;
}

/** @returns The geth engine (auth) RPC port chosen at startup. */
export function getAuthRpcPort(): number {
  return resolvedAuthRpcPort;
}

/**
 * Picks free HTTP and auth RPC ports for geth. The auth scan skips the HTTP
 * port, which is chosen but not yet bound.
 * @returns {Promise<void>}
 */
export async function resolveGethPorts(): Promise<void> {
  resolvedRpcPort = await findAvailablePort(DEFAULT_RPC_PORT);
  resolvedAuthRpcPort = await findAvailablePort(
    DEFAULT_AUTH_RPC_PORT,
    resolvedRpcPort,
  );
}

/**
 * Scans for the first available TCP port starting from a default.
 * Uses detect-port to avoid binding conflicts with other local services.
 * @param startPort - The preferred port and start of the scan range.
 * @param reservedPort - A port already assigned to geth but not yet bound, so detect-port cannot see it.
 * @returns A promise resolving to the first available port number, or startPort when none is free.
 */
export async function findAvailablePort(
  startPort: number,
  reservedPort?: number,
): Promise<number> {
  const portRangeEnd = startPort + MAX_PORT_SCAN_ATTEMPTS;

  for (let candidate = startPort; candidate < portRangeEnd; candidate++) {
    if (candidate === reservedPort) continue;
    try {
      const available = await detectPort(candidate);
      if (available === candidate) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return startPort;
}
