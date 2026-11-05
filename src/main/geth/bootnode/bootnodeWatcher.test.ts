import { afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { SigningKey, toBeHex } from "ethers";
import { BootnodeSource } from "../../../bridge/types";
import { FALLBACK_BOOTNODE_ENODES } from "./bootnode";
import { BOOTNODES_SETTING_KEY } from "./bootnodeSettings";
import { startStaticPeers, stopStaticPeers } from "./staticPeers";
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
vi.mock("./staticPeers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./staticPeers")>()),
  startStaticPeers: vi.fn(),
  stopStaticPeers: vi.fn(),
}));
vi.mock("../rpc/rpcUtils", () => ({ callGethRpcRaw: vi.fn() }));
vi.mock("../process/ports", () => ({ getRpcPort: () => 8545 }));

function nodeIdFor(seed: number): string {
  return new SigningKey(toBeHex(seed, 32)).publicKey.slice(4);
}

const IP_ENODE = `enode://${nodeIdFor(1)}@10.0.0.5:30303`;
const SECOND_IP_ENODE = `enode://${nodeIdFor(2)}@10.0.0.6:30303`;
const HOST_ENODE = `enode://${nodeIdFor(3)}@boot.example:30303`;

function storeWith(custom: readonly string[]): {
  get: (key: string) => unknown;
} {
  const saved = {
    custom: custom.map((enode) => ({ enode, label: "" })),
    disabled: [...FALLBACK_BOOTNODE_ENODES],
  };
  return { get: (key) => (key === BOOTNODES_SETTING_KEY ? saved : undefined) };
}

describe("prepareBootnodeArgs", () => {
  afterEach(() => {
    forgetRunningBootnodes();
    vi.clearAllMocks();
  });

  it("passes every node to geth, comma-joined, and queues them as static peers", async () => {
    const args = await prepareBootnodeArgs(
      storeWith([IP_ENODE, SECOND_IP_ENODE]),
    );

    expect(args).toEqual(["--bootnodes", `${IP_ENODE},${SECOND_IP_ENODE}`]);
    expect(getActiveBootnodeConfig()).toMatchObject({
      enodes: [IP_ENODE, SECOND_IP_ENODE],
      source: BootnodeSource.USER,
    });
    expect(startStaticPeers).toHaveBeenCalledWith([IP_ENODE, SECOND_IP_ENODE]);
  });

  it("uses the three campus nodes when nothing is saved", async () => {
    const args = await prepareBootnodeArgs({ get: () => undefined });

    expect(args).toEqual(["--bootnodes", FALLBACK_BOOTNODE_ENODES.join(",")]);
  });

  it("leaves an unresolved hostname out of --bootnodes but still queues it", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));

    const args = await prepareBootnodeArgs(storeWith([HOST_ENODE, IP_ENODE]));

    expect(args).toEqual(["--bootnodes", IP_ENODE]);
    expect(startStaticPeers).toHaveBeenCalledWith([HOST_ENODE, IP_ENODE]);
  });

  it("starts without --bootnodes when none resolves", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));

    await expect(prepareBootnodeArgs(storeWith([HOST_ENODE]))).resolves.toEqual(
      [],
    );
  });
});

describe("forgetRunningBootnodes", () => {
  it("clears the active config and the static peers once geth stops", async () => {
    await prepareBootnodeArgs(storeWith([IP_ENODE]));

    forgetRunningBootnodes();

    expect(getActiveBootnodeConfig()).toBeNull();
    expect(stopStaticPeers).toHaveBeenCalled();
  });
});
