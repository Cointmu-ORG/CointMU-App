import { afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { BootnodeSource } from "../../../bridge/types";
import { BOOTNODES_SETTING_KEY } from "./bootnodeSettings";
import {
  forgetRunningBootnodes,
  getActiveBootnodeConfig,
  prepareBootnodeArgs,
} from "./bootnodeWatcher";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("../../diagnostics/gethReporting", () => ({
  reportBootnodeConfigProblem: vi.fn(),
  reportBootnodeSource: vi.fn(),
}));
vi.mock("../rpc/rpcUtils", () => ({ callGethRpc: vi.fn() }));
vi.mock("../process/ports", () => ({ getRpcPort: () => 8545 }));

// The secp256k1 generator point G: the public key of private key 1.
const NODE_ID =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const IP_ENODE = `enode://${NODE_ID}@10.0.0.5:30303`;
const SECOND_IP_ENODE = `enode://${NODE_ID}@10.0.0.6:30303`;
const HOST_ENODE = `enode://${NODE_ID}@boot.example:30303`;

function storeWith(saved: unknown): { get: (key: string) => unknown } {
  return { get: (key) => (key === BOOTNODES_SETTING_KEY ? saved : undefined) };
}

describe("prepareBootnodeArgs", () => {
  afterEach(() => {
    forgetRunningBootnodes();
  });

  it("passes every user bootnode to geth, comma-joined, and records them as active", async () => {
    const args = await prepareBootnodeArgs(
      storeWith([IP_ENODE, SECOND_IP_ENODE]),
    );

    expect(args).toEqual(["--bootnodes", `${IP_ENODE},${SECOND_IP_ENODE}`]);
    expect(getActiveBootnodeConfig()).toMatchObject({
      enodes: [IP_ENODE, SECOND_IP_ENODE],
      source: BootnodeSource.USER,
    });
  });

  it("leaves out a bootnode whose hostname does not resolve", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));

    const args = await prepareBootnodeArgs(storeWith([HOST_ENODE, IP_ENODE]));

    expect(args).toEqual(["--bootnodes", IP_ENODE]);
  });

  it("starts without --bootnodes when none resolves", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));

    await expect(prepareBootnodeArgs(storeWith([HOST_ENODE]))).resolves.toEqual(
      [],
    );
  });
});

describe("forgetRunningBootnodes", () => {
  it("clears the active config once geth stops", async () => {
    await prepareBootnodeArgs(storeWith([IP_ENODE]));

    forgetRunningBootnodes();

    expect(getActiveBootnodeConfig()).toBeNull();
  });
});
