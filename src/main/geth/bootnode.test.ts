import { describe, expect, it } from "vitest";
import {
  BootnodeConfigProblem,
  BootnodeSource,
  FALLBACK_BOOTNODE_ENODE,
  formatEnode,
  parseEnode,
  resolveBootnodeConfig,
} from "./bootnode";

// The secp256k1 generator point G: the public key of private key 1.
const NODE_ID =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
// Valid hex of the right length, but not a point on the curve.
const OFF_CURVE_NODE_ID = "ab".repeat(64);
const ENODE = `enode://${NODE_ID}@10.0.0.5:30303`;

describe("parseEnode", () => {
  it("accepts the built-in fallback bootnode", () => {
    expect(parseEnode(FALLBACK_BOOTNODE_ENODE)).not.toBeNull();
  });

  it("parses an IP enode", () => {
    expect(parseEnode(ENODE)).toEqual({
      nodeId: NODE_ID,
      host: "10.0.0.5",
      port: 30303,
      isIp: true,
      query: "",
    });
  });

  it("parses a hostname, an IPv6 host and a discport", () => {
    expect(parseEnode(`enode://${NODE_ID}@boot.lan:30303`)).toMatchObject({
      host: "boot.lan",
      isIp: false,
    });
    expect(parseEnode(`enode://${NODE_ID}@[fd00::1]:30303`)).toMatchObject({
      host: "fd00::1",
      isIp: true,
    });
    expect(parseEnode(`${ENODE}?discport=30301`)).toMatchObject({
      query: "?discport=30301",
    });
  });

  it.each([
    ["empty", ""],
    ["not a URL", "10.0.0.5:30303"],
    ["wrong scheme", `enr://${NODE_ID}@10.0.0.5:30303`],
    ["placeholder key", "enode://PLACEHOLDER_PUBLIC_KEY@BOOTNODE_IP:30303"],
    ["short key", `enode://${NODE_ID.slice(2)}@10.0.0.5:30303`],
    ["non-hex key", `enode://${"zz".repeat(64)}@10.0.0.5:30303`],
    ["key not on the curve", `enode://${OFF_CURVE_NODE_ID}@10.0.0.5:30303`],
    ["point at infinity", `enode://${"00".repeat(64)}@10.0.0.5:30303`],
    ["missing key", "enode://10.0.0.5:30303"],
    ["missing port", `enode://${NODE_ID}@10.0.0.5`],
    ["port 0", `enode://${NODE_ID}@10.0.0.5:0`],
    ["port too large", `enode://${NODE_ID}@10.0.0.5:65536`],
    ["path", `${ENODE}/x`],
    ["unknown query", `${ENODE}?foo=1`],
    ["bad discport", `${ENODE}?discport=abc`],
  ])("rejects %s", (_, enode) => {
    expect(parseEnode(enode)).toBeNull();
  });
});

describe("formatEnode", () => {
  it("swaps the host and keeps port and discport", () => {
    const parsed = parseEnode(`enode://${NODE_ID}@boot.lan:30303?discport=1`);
    if (!parsed) throw new Error("fixture enode did not parse");

    expect(formatEnode(parsed, "10.0.0.9")).toBe(
      `enode://${NODE_ID}@10.0.0.9:30303?discport=1`,
    );
    expect(formatEnode(parsed, "fd00::9")).toBe(
      `enode://${NODE_ID}@[fd00::9]:30303?discport=1`,
    );
  });
});

describe("resolveBootnodeConfig", () => {
  it("has a valid fallback", () => {
    expect(parseEnode(FALLBACK_BOOTNODE_ENODE)).not.toBeNull();
  });

  it.each([undefined, "", "  "])(
    "uses the fallback when the build sets nothing (%j)",
    (buildValue) => {
      expect(resolveBootnodeConfig(buildValue)).toEqual({
        enode: FALLBACK_BOOTNODE_ENODE,
        source: BootnodeSource.FALLBACK,
        problem: null,
      });
    },
  );

  it("uses a valid build value, trimmed", () => {
    expect(resolveBootnodeConfig(` ${ENODE} `)).toEqual({
      enode: ENODE,
      source: BootnodeSource.BUILD,
      problem: null,
    });
  });

  it("falls back and reports a build value whose key is off the curve", () => {
    expect(
      resolveBootnodeConfig(`enode://${OFF_CURVE_NODE_ID}@10.0.0.5:30303`),
    ).toEqual({
      enode: FALLBACK_BOOTNODE_ENODE,
      source: BootnodeSource.FALLBACK,
      problem: BootnodeConfigProblem.INVALID_BUILD_VALUE,
    });
  });

  it("falls back and reports an invalid build value", () => {
    expect(resolveBootnodeConfig("enode://stale@10.0.0.5:30303")).toEqual({
      enode: FALLBACK_BOOTNODE_ENODE,
      source: BootnodeSource.FALLBACK,
      problem: BootnodeConfigProblem.INVALID_BUILD_VALUE,
    });
  });
});
