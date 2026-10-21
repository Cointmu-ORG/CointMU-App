import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { GENESIS_BLOCK } from "../services/genesis";
import {
  buildGenesis,
  getNetworkId,
  loadNetworkId,
  resolveDataDir,
  setNetworkId,
} from "./networkConfig";

// vi.mock is hoisted above the imports, so its constant must be hoisted too.
const { USER_DATA_DIR } = vi.hoisted(() => ({ USER_DATA_DIR: "/user-data" }));

vi.mock("electron", () => ({ app: { getPath: () => USER_DATA_DIR } }));

/** A store whose only persisted value is the chain-id override. */
function storeWithChainId(chainId: unknown): { get: (key: string) => unknown } {
  return { get: (key) => (key === "network.chainId" ? chainId : undefined) };
}

describe("loadNetworkId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers a positive persisted override", () => {
    vi.stubEnv("GETH_NETWORK_ID", "777");

    loadNetworkId(storeWithChainId(4242));

    expect(getNetworkId()).toBe("4242");
  });

  it("falls back to GETH_NETWORK_ID when the override is not positive", () => {
    vi.stubEnv("GETH_NETWORK_ID", "777");

    loadNetworkId(storeWithChainId(0));

    expect(getNetworkId()).toBe("777");
  });

  it("falls back to the genesis chain id when neither value is usable", () => {
    vi.stubEnv("GETH_NETWORK_ID", "not-a-number");

    loadNetworkId(storeWithChainId(undefined));

    expect(getNetworkId()).toBe(String(GENESIS_BLOCK.config.chainId));
  });
});

describe("buildGenesis", () => {
  it("applies the active network id without touching the rest", () => {
    setNetworkId("31337");

    const genesis = buildGenesis();

    expect(genesis.config.chainId).toBe(31337);
    expect({ ...genesis, config: GENESIS_BLOCK.config }).toEqual(GENESIS_BLOCK);
  });
});

describe("resolveDataDir", () => {
  it("nests the network id under the userData chaindata folder", () => {
    setNetworkId("4242");

    expect(resolveDataDir()).toBe(
      join(USER_DATA_DIR, "cointmu-chaindata", "4242"),
    );
  });
});
