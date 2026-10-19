import { describe, expect, it } from "vitest";
import {
  GETH_HTTP_API_NAMESPACES,
  isBridgeRpcAllowed,
  isPrivilegedNodeMethod,
  isPublicReadMethod,
  isRendererRpcAllowed,
} from "./rpcMethodPolicy";

const NODE_CONTROL_ATTACKS = [
  "miner_setEtherbase",
  "admin_startWS",
  "admin_startHTTP",
  "admin_exportChain",
  "admin_addPeer",
  "personal_newAccount",
  "personal_unlockAccount",
];
const SIGNING = [
  "eth_sign",
  "eth_signTransaction",
  "eth_sendTransaction",
  "eth_signTypedData_v4",
  "personal_sign",
];
const READS = [
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_sendRawTransaction",
  "net_version",
  "web3_clientVersion",
];

describe("isBridgeRpcAllowed", () => {
  it.each(READS)("forwards read method %s", (method) => {
    expect(isBridgeRpcAllowed(method)).toBe(true);
  });

  it.each([...NODE_CONTROL_ATTACKS, ...SIGNING, "debug_traceTransaction"])(
    "refuses %s",
    (method) => {
      expect(isBridgeRpcAllowed(method)).toBe(false);
    },
  );
});

describe("isRendererRpcAllowed", () => {
  it.each([...READS, "miner_setEtherbase", "miner_start", "miner_stop"])(
    "allows %s for the app",
    (method) => {
      expect(isRendererRpcAllowed(method)).toBe(true);
    },
  );

  it.each([
    "admin_startWS",
    "admin_exportChain",
    "personal_newAccount",
    "miner_setExtra",
    ...SIGNING,
  ])("refuses %s for the app", (method) => {
    expect(isRendererRpcAllowed(method)).toBe(false);
  });
});

describe("isPrivilegedNodeMethod", () => {
  it.each(["admin_addPeer", "miner_start"])("routes %s over IPC", (method) => {
    expect(isPrivilegedNodeMethod(method)).toBe(true);
  });

  it.each(["eth_mining", "net_peerCount"])("routes %s over HTTP", (method) => {
    expect(isPrivilegedNodeMethod(method)).toBe(false);
  });
});

describe("GETH_HTTP_API_NAMESPACES", () => {
  it("only exposes namespaces whose methods are public reads", () => {
    for (const namespace of GETH_HTTP_API_NAMESPACES.split(",")) {
      expect(isPublicReadMethod(`${namespace}_anything`)).toBe(true);
    }
  });
});
