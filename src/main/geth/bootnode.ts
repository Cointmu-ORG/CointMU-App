import { isIP } from "node:net";
import { SigningKey } from "ethers";

const ENODE_PROTOCOL = "enode:";
// secp256k1 public key without the 0x04 prefix: 64 bytes as hex.
const NODE_ID_PATTERN = /^[0-9a-f]{128}$/i;
const UNCOMPRESSED_KEY_PREFIX = "0x04";
const DISCPORT_PARAM = "discport";
const MAX_PORT = 65535;
const IPV6_FAMILY = 6;

/**
 * The live campus bootnode. Its key is pinned on the server (--nodekey
 * boot.key), so the enode only changes if that key does. Used when the build
 * sets no MAIN_VITE_BOOTNODE_ENODE.
 */
export const FALLBACK_BOOTNODE_ENODE =
  "enode://4b74ebfd9f2cd50cf2cfe42b60e07ff302188233c7cdd51a401b1bf391d6fc8efe5f105bd4b11a09d1ae2d36082797e2d395df1211827cea4f46a8b40c71eb40@10.64.24.248:30303";

export interface ParsedEnode {
  readonly nodeId: string;
  /** Hostname or IP, IPv6 without brackets. */
  readonly host: string;
  readonly port: number;
  readonly isIp: boolean;
  /** The `?discport=` suffix, or "". */
  readonly query: string;
}

export const BootnodeSource = {
  BUILD: "build",
  FALLBACK: "fallback",
} as const;

export type BootnodeSource =
  (typeof BootnodeSource)[keyof typeof BootnodeSource];

export const BootnodeConfigProblem = {
  /** MAIN_VITE_BOOTNODE_ENODE was set but is not a valid enode URL. */
  INVALID_BUILD_VALUE: "invalid-build-value",
} as const;

export type BootnodeConfigProblem =
  (typeof BootnodeConfigProblem)[keyof typeof BootnodeConfigProblem];

export interface BootnodeConfig {
  readonly enode: string;
  readonly source: BootnodeSource;
  readonly problem: BootnodeConfigProblem | null;
}

function parsePort(value: string): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : null;
}

/**
 * Checks that a node id is a real secp256k1 public key. Geth rejects an enode
 * whose key is not on the curve ("Bootstrap URL invalid") on every start.
 * @param nodeId - 128 hex chars: the uncompressed key without its 04 prefix.
 * @returns True when the point lies on the curve.
 */
function isSecp256k1PublicKey(nodeId: string): boolean {
  try {
    SigningKey.computePublicKey(`${UNCOMPRESSED_KEY_PREFIX}${nodeId}`);
    return true;
  } catch {
    // ethers throws "bad point" for keys off the curve; that is the invalid case.
    return false;
  }
}

function hasValidQuery(url: URL): boolean {
  const keys = [...url.searchParams.keys()];
  if (keys.length === 0) return true;
  const discport = url.searchParams.get(DISCPORT_PARAM);
  return keys.length === 1 && discport !== null && parsePort(discport) !== null;
}

/**
 * Parses and validates an enode URL (enode://<node id>@<host>:<port>, with an
 * optional ?discport=<port>), the form geth accepts for --bootnodes. The node
 * id must be a secp256k1 public key, not just 128 hex chars.
 * @param enode - The enode URL.
 * @returns The parsed parts, or null when the URL is not a valid enode.
 */
export function parseEnode(enode: string): ParsedEnode | null {
  let url: URL;
  try {
    url = new URL(enode.trim());
  } catch {
    // Not a URL at all; the caller treats null as invalid.
    return null;
  }
  const port = parsePort(url.port);
  const isWellFormed =
    url.protocol === ENODE_PROTOCOL &&
    NODE_ID_PATTERN.test(url.username) &&
    isSecp256k1PublicKey(url.username) &&
    !url.password &&
    url.hostname !== "" &&
    url.pathname === "" &&
    !url.hash &&
    hasValidQuery(url);
  if (!isWellFormed || port === null) return null;
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  return {
    nodeId: url.username.toLowerCase(),
    host,
    port,
    isIp: isIP(host) !== 0,
    query: url.search,
  };
}

/**
 * Formats a parsed enode with a different host, e.g. the IP a hostname
 * resolved to.
 * @param enode - The parsed enode.
 * @param host - The host to use; IPv6 addresses are bracketed.
 * @returns The enode URL.
 */
export function formatEnode(enode: ParsedEnode, host: string): string {
  const authority = isIP(host) === IPV6_FAMILY ? `[${host}]` : host;
  return `enode://${enode.nodeId}@${authority}:${enode.port}${enode.query}`;
}

/**
 * Picks the bootnode: the value baked in at build time when it is a valid
 * enode, otherwise the built-in fallback.
 * @param buildValue - MAIN_VITE_BOOTNODE_ENODE as provided by the build env.
 * @returns The enode to use, where it came from, and why the build value was
 * rejected (if it was).
 */
export function resolveBootnodeConfig(
  buildValue: string | undefined,
): BootnodeConfig {
  const configured = buildValue?.trim() ?? "";
  if (!configured) {
    return {
      enode: FALLBACK_BOOTNODE_ENODE,
      source: BootnodeSource.FALLBACK,
      problem: null,
    };
  }
  if (parseEnode(configured)) {
    return { enode: configured, source: BootnodeSource.BUILD, problem: null };
  }
  return {
    enode: FALLBACK_BOOTNODE_ENODE,
    source: BootnodeSource.FALLBACK,
    problem: BootnodeConfigProblem.INVALID_BUILD_VALUE,
  };
}
