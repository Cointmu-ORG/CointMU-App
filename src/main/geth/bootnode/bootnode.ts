import { isIP } from "node:net";
import { SigningKey } from "ethers";
import {
  BootnodeSource,
  type InvalidBootnodeEntry,
} from "../../../bridge/types";

const ENODE_PROTOCOL = "enode:";
// secp256k1 public key without the 0x04 prefix: 64 bytes as hex.
const NODE_ID_PATTERN = /^[0-9a-f]{128}$/i;
const UNCOMPRESSED_KEY_PREFIX = "0x04";
const DISCPORT_PARAM = "discport";
const MAX_PORT = 65535;
const IPV6_FAMILY = 6;
// Bootnode lists accept one enode per line, comma-separated, or both.
const LIST_SEPARATOR = /[\s,]+/;
/** Upper bound for a saved or baked-in list; geth dials every entry on start. */
export const MAX_BOOTNODES = 10;

/**
 * The live campus bootnodes. Each key is pinned on its server (--nodekey
 * boot.key), so an enode only changes if that key does. Used when neither the
 * user nor the build (MAIN_VITE_BOOTNODE_ENODE) sets bootnodes.
 */
export const FALLBACK_BOOTNODE_ENODES: readonly string[] = [
  "enode://aafe317d76f528fde06ee7b4017b5dda1e0ac20c25444e4218bfa6ce79a8bd2449eb258c3f077358d0fa02e727f53482d0582d64ef0f95e80d146222606c4dd5@10.64.24.101:30303",
];

export interface BootnodeList {
  /** Valid enodes, trimmed and without duplicates, in input order. */
  readonly enodes: readonly string[];
  readonly invalid: readonly InvalidBootnodeEntry[];
}

export interface ParsedEnode {
  readonly nodeId: string;
  /** Hostname or IP, IPv6 without brackets. */
  readonly host: string;
  readonly port: number;
  readonly isIp: boolean;
  /** The `?discport=` suffix, or "". */
  readonly query: string;
}

export const BootnodeConfigProblem = {
  /** MAIN_VITE_BOOTNODE_ENODE was set but is not a list of valid enode URLs. */
  INVALID_BUILD_VALUE: "invalid-build-value",
  /** The saved user list is not valid, e.g. the settings file was edited by hand. */
  INVALID_USER_VALUE: "invalid-user-value",
} as const;

export type BootnodeConfigProblem =
  (typeof BootnodeConfigProblem)[keyof typeof BootnodeConfigProblem];

export interface BootnodeConfig {
  readonly enodes: readonly string[];
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
 * Splits a bootnode list (one per line, comma-separated, or both) and checks
 * every entry with parseEnode.
 * @param text - The list as typed or configured.
 * @returns The valid enodes without duplicates, in input order, and every
 * invalid entry with its 1-based position.
 */
export function parseBootnodeList(text: string): BootnodeList {
  const enodes: string[] = [];
  const invalid: InvalidBootnodeEntry[] = [];
  text
    .split(LIST_SEPARATOR)
    .filter(Boolean)
    .forEach((value, index) => {
      if (!parseEnode(value)) {
        invalid.push({ position: index + 1, value });
      } else if (!enodes.includes(value)) {
        enodes.push(value);
      }
    });
  return { enodes, invalid };
}

function fallbackConfig(problem: BootnodeConfigProblem | null): BootnodeConfig {
  return {
    enodes: FALLBACK_BOOTNODE_ENODES,
    source: BootnodeSource.FALLBACK,
    problem,
  };
}

/**
 * Picks the default bootnodes: the list baked in at build time when every
 * entry is a valid enode, otherwise the built-in fallback.
 * @param buildValue - MAIN_VITE_BOOTNODE_ENODE as provided by the build env.
 * @returns The enodes to use, where they came from, and why the build value
 * was rejected (if it was).
 */
export function resolveBuildBootnodes(
  buildValue: string | undefined,
): BootnodeConfig {
  const { enodes, invalid } = parseBootnodeList(buildValue ?? "");
  if (invalid.length > 0 || enodes.length > MAX_BOOTNODES) {
    return fallbackConfig(BootnodeConfigProblem.INVALID_BUILD_VALUE);
  }
  if (enodes.length === 0) return fallbackConfig(null);
  return { enodes, source: BootnodeSource.BUILD, problem: null };
}

/**
 * @param value - A value read from the settings store.
 * @returns True for a non-empty list of at most MAX_BOOTNODES valid enodes.
 */
export function isBootnodeList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_BOOTNODES &&
    value.every((enode) => typeof enode === "string" && parseEnode(enode))
  );
}

/**
 * Applies the priority user setting > build value > fallback. The saved user
 * list is validated again here because the settings file can be edited
 * outside the app; an invalid one is ignored as a whole.
 * @param userValue - The saved custom list; empty or missing means "default".
 * @param defaults - The result of resolveBuildBootnodes.
 * @returns The enodes geth should dial and where they came from.
 */
export function resolveBootnodeConfig(
  userValue: unknown,
  defaults: BootnodeConfig,
): BootnodeConfig {
  const isUnset =
    userValue === undefined ||
    userValue === null ||
    (Array.isArray(userValue) && userValue.length === 0);
  if (isUnset) return defaults;
  if (isBootnodeList(userValue)) {
    return { enodes: userValue, source: BootnodeSource.USER, problem: null };
  }
  return { ...defaults, problem: BootnodeConfigProblem.INVALID_USER_VALUE };
}
