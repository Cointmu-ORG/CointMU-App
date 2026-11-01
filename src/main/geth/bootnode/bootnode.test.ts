import { describe, expect, it } from "vitest";
import { BootnodeSource } from "../../../bridge/types";
import {
  BootnodeConfigProblem,
  FALLBACK_BOOTNODE_ENODES,
  MAX_BOOTNODES,
  formatEnode,
  isBootnodeList,
  parseBootnodeList,
  parseEnode,
  resolveBootnodeConfig,
  resolveBuildBootnodes,
} from "./bootnode";

// The secp256k1 generator point G: the public key of private key 1.
const NODE_ID =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
// Valid hex of the right length, but not a point on the curve.
const OFF_CURVE_NODE_ID = "ab".repeat(64);
const ENODE = `enode://${NODE_ID}@10.0.0.5:30303`;
const SECOND_ENODE = `enode://${NODE_ID}@10.0.0.6:30303`;
const OFF_CURVE_ENODE = `enode://${OFF_CURVE_NODE_ID}@10.0.0.5:30303`;

describe("parseEnode", () => {
  it.each(FALLBACK_BOOTNODE_ENODES)(
    "accepts the built-in fallback bootnode %s",
    (enode) => {
      expect(parseEnode(enode)).not.toBeNull();
    },
  );

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

describe("parseBootnodeList", () => {
  it("splits on newlines, commas and blank space, skipping empty entries", () => {
    const text = `\n ${ENODE} ,\r\n\n${SECOND_ENODE},\n`;

    expect(parseBootnodeList(text)).toEqual({
      enodes: [ENODE, SECOND_ENODE],
      invalid: [],
    });
  });

  it("drops duplicates and keeps the input order", () => {
    expect(
      parseBootnodeList(`${SECOND_ENODE}\n${ENODE}\n${SECOND_ENODE}`).enodes,
    ).toEqual([SECOND_ENODE, ENODE]);
  });

  it("reports every invalid entry with its 1-based position", () => {
    const text = `${ENODE}\nenode://stale@10.0.0.5:30303,${OFF_CURVE_ENODE}`;

    expect(parseBootnodeList(text)).toEqual({
      enodes: [ENODE],
      invalid: [
        { position: 2, value: "enode://stale@10.0.0.5:30303" },
        { position: 3, value: OFF_CURVE_ENODE },
      ],
    });
  });

  it("returns nothing for blank input", () => {
    expect(parseBootnodeList(" \n , ")).toEqual({ enodes: [], invalid: [] });
  });
});

describe("resolveBuildBootnodes", () => {
  it.each([undefined, "", "  "])(
    "uses the fallback when the build sets nothing (%j)",
    (buildValue) => {
      expect(resolveBuildBootnodes(buildValue)).toEqual({
        enodes: FALLBACK_BOOTNODE_ENODES,
        source: BootnodeSource.FALLBACK,
        problem: null,
      });
    },
  );

  it("uses a valid build value, trimmed", () => {
    expect(resolveBuildBootnodes(` ${ENODE} `)).toEqual({
      enodes: [ENODE],
      source: BootnodeSource.BUILD,
      problem: null,
    });
  });

  it("accepts a comma-separated build list", () => {
    expect(resolveBuildBootnodes(`${ENODE},${SECOND_ENODE}`).enodes).toEqual([
      ENODE,
      SECOND_ENODE,
    ]);
  });

  it.each([
    ["a key off the curve", OFF_CURVE_ENODE],
    ["a malformed enode", "enode://stale@10.0.0.5:30303"],
    ["one bad entry in a list", `${ENODE},enode://stale@10.0.0.5:30303`],
  ])("falls back and reports a build value with %s", (_, buildValue) => {
    expect(resolveBuildBootnodes(buildValue)).toEqual({
      enodes: FALLBACK_BOOTNODE_ENODES,
      source: BootnodeSource.FALLBACK,
      problem: BootnodeConfigProblem.INVALID_BUILD_VALUE,
    });
  });
});

describe("isBootnodeList", () => {
  it("accepts a list of valid enodes", () => {
    expect(isBootnodeList([ENODE, SECOND_ENODE])).toBe(true);
  });

  it.each([
    ["an empty list", []],
    ["a string", ENODE],
    ["a non-string entry", [ENODE, 1]],
    ["an invalid enode", [ENODE, OFF_CURVE_ENODE]],
    ["too many entries", Array(MAX_BOOTNODES + 1).fill(ENODE)],
  ])("rejects %s", (_, value) => {
    expect(isBootnodeList(value)).toBe(false);
  });
});

describe("resolveBootnodeConfig", () => {
  const BUILD_DEFAULTS = resolveBuildBootnodes(SECOND_ENODE);
  const FALLBACK_DEFAULTS = resolveBuildBootnodes(undefined);

  it("prefers the saved user list over the build value", () => {
    expect(resolveBootnodeConfig([ENODE], BUILD_DEFAULTS)).toEqual({
      enodes: [ENODE],
      source: BootnodeSource.USER,
      problem: null,
    });
  });

  it("uses the build value when the user saved nothing", () => {
    expect(resolveBootnodeConfig(undefined, BUILD_DEFAULTS)).toBe(
      BUILD_DEFAULTS,
    );
  });

  it("uses the fallback when neither the user nor the build sets bootnodes", () => {
    expect(resolveBootnodeConfig([], FALLBACK_DEFAULTS)).toEqual({
      enodes: FALLBACK_BOOTNODE_ENODES,
      source: BootnodeSource.FALLBACK,
      problem: null,
    });
  });

  it.each([
    ["an invalid enode", [OFF_CURVE_ENODE]],
    ["a non-list value", ENODE],
  ])("ignores and reports a saved value with %s", (_, userValue) => {
    expect(resolveBootnodeConfig(userValue, BUILD_DEFAULTS)).toEqual({
      ...BUILD_DEFAULTS,
      problem: BootnodeConfigProblem.INVALID_USER_VALUE,
    });
  });
});
