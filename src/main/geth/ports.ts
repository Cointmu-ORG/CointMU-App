import { createSocket } from "node:dgram";
import detectPort from "detect-port";

const MAX_PORT_SCAN_ATTEMPTS = 50;
const ANY_IPV4_ADDR = "0.0.0.0";

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
 * Probes a TCP port with detect-port.
 * @param port - The port to probe.
 * @returns True when the port can be bound on TCP.
 */
async function isTcpPortFree(port: number): Promise<boolean> {
  try {
    return (await detectPort(port)) === port;
  } catch {
    return false;
  }
}

/**
 * Probes a UDP port by binding a throwaway socket and closing it again. Any
 * bind error counts as taken, including EACCES from a Windows reserved range.
 * @param port - The port to probe.
 * @returns True when the port can be bound on UDP.
 */
export function isUdpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // ponytail: udp4 only, so a v6-only socket on the port goes unseen; probe udp6 too if that ever bites.
    const socket = createSocket("udp4");
    socket.once("error", () => {
      socket.close();
      resolve(false);
    });
    socket.bind(port, ANY_IPV4_ADDR, () => socket.close(() => resolve(true)));
  });
}

/**
 * Returns the first port from startPort on that passes the probe.
 * @param startPort - The preferred port and start of the scan range.
 * @param isFree - Decides whether a candidate port can be used.
 * @returns The first free port, or startPort when none is free.
 */
async function scanPorts(
  startPort: number,
  isFree: (port: number) => Promise<boolean>,
): Promise<number> {
  const portRangeEnd = startPort + MAX_PORT_SCAN_ATTEMPTS;
  for (let candidate = startPort; candidate < portRangeEnd; candidate++) {
    if (await isFree(candidate)) return candidate;
  }
  return startPort;
}

/**
 * Scans for the first available TCP port starting from a default.
 * Uses detect-port to avoid binding conflicts with other local services.
 * @param startPort - The preferred port and start of the scan range.
 * @param reservedPort - A port already assigned to geth but not yet bound, so detect-port cannot see it.
 * @returns A promise resolving to the first available port number, or startPort when none is free.
 */
export function findAvailablePort(
  startPort: number,
  reservedPort?: number,
): Promise<number> {
  return scanPorts(
    startPort,
    async (port) => port !== reservedPort && isTcpPortFree(port),
  );
}

/**
 * Scans for the first P2P port that is free on both TCP (RLPx) and UDP
 * (discovery), since geth binds the same port number for both.
 * @param startPort - The configured listen port and start of the scan range.
 * @returns The first port free on TCP and UDP, or startPort when none is.
 */
export function findAvailableP2pPort(startPort: number): Promise<number> {
  return scanPorts(
    startPort,
    async (port) => (await isTcpPortFree(port)) && isUdpPortFree(port),
  );
}
