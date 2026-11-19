import { BlockList, isIP } from "node:net";

/**
 * Which resolved addresses a public fetch may connect to. Anything that is
 * not a globally routable unicast address is refused.
 */

// BlockList also matches IPv4-mapped IPv6 (::ffff:7f00:1) against the IPv4
// rules, so no separate ::ffff:0:0/96 entry (it would block every IPv4).
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], // unspecified / "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128],
  ["fe80::", 10],
  ["fc00::", 7], // ULA
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

const IPV6_BYTES = 16;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const HEX_RADIX = 16;
// NAT64 prefixes embed an IPv4 address (RFC 6052): the well-known /96 in
// its last 4 bytes; the local-use /48 (RFC 8215) in bytes 6-7 and 9-10,
// byte 8 being the reserved "u" octet.
const NAT64_WELL_KNOWN = new BlockList();
NAT64_WELL_KNOWN.addSubnet("64:ff9b::", 96, "ipv6");
const NAT64_LOCAL_USE = new BlockList();
NAT64_LOCAL_USE.addSubnet("64:ff9b:1::", 48, "ipv6");
const NAT64_WELL_KNOWN_V4_BYTES = [12, 13, 14, 15];
const NAT64_LOCAL_USE_V4_BYTES = [6, 7, 9, 10];

/** @returns The 16 bytes of a valid IPv6 address (any notation). */
function ipv6Bytes(address: string): number[] {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted !== null) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    text =
      text.slice(0, dotted.index) +
      ((a << BYTE_BITS) | b).toString(HEX_RADIX) +
      ":" +
      ((c << BYTE_BITS) | d).toString(HEX_RADIX);
  }
  const [head, tail = ""] = text.split("::");
  const groups = (part: string): number[] =>
    part === "" ? [] : part.split(":").map((g) => parseInt(g, HEX_RADIX));
  const left = groups(head);
  const right = text.includes("::") ? groups(tail) : [];
  const zeros = Array(IPV6_BYTES / 2 - left.length - right.length).fill(0);
  return [...left, ...zeros, ...right].flatMap((g) => [
    g >> BYTE_BITS,
    g & BYTE_MASK,
  ]);
}

/** @returns The IPv4 address a NAT64 address translates to, or null. */
export function nat64Ipv4(address: string): string | null {
  const positions = NAT64_WELL_KNOWN.check(address, "ipv6")
    ? NAT64_WELL_KNOWN_V4_BYTES
    : NAT64_LOCAL_USE.check(address, "ipv6")
      ? NAT64_LOCAL_USE_V4_BYTES
      : null;
  if (positions === null) return null;
  const bytes = ipv6Bytes(address);
  return positions.map((i) => bytes[i]).join(".");
}

/** @returns True for an address a public fetch must not reach. */
export function isBlockedAddress(address: string): boolean {
  const lower = address.toLowerCase();
  const family = isIP(lower);
  if (family === 0) return true;
  if (family === 6) {
    const embedded = nat64Ipv4(lower);
    if (embedded !== null) return isBlockedAddress(embedded);
  }
  return blocked.check(lower, family === 4 ? "ipv4" : "ipv6");
}
