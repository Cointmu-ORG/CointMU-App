import { afterEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { GENESIS_BLOCK } from "../services/genesis";
import {
  buildGenesis,
  getNetworkId,
  loadNetworkId,
  resolveDataDir,
} from "./networkConfig";

// vi.mock is hoisted above the imports, so its constant must be hoisted too.
const { USER_DATA_DIR } = vi.hoisted(() => ({ USER_DATA_DIR: "/user-data" }));

vi.mock("electron", () => ({ app: { getPath: () => USER_DATA_DIR } }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadNetworkId", () => {
  it("uses a positive GETH_NETWORK_ID", () => {
    vi.stubEnv("GETH_NETWORK_ID", "777");

    loadNetworkId();

    expect(getNetworkId()).toBe("777");
  });

  it.each(["not-a-number", "0", ""])(
    "falls back to the genesis chain id when GETH_NETWORK_ID is %j",
    (value) => {
      vi.stubEnv("GETH_NETWORK_ID", value);

      loadNetworkId();

      expect(getNetworkId()).toBe(String(GENESIS_BLOCK.config.chainId));
    },
  );
});

describe("buildGenesis", () => {
  it("applies the active network id without touching the rest", () => {
    vi.stubEnv("GETH_NETWORK_ID", "31337");
    loadNetworkId();

    const genesis = buildGenesis();

    expect(genesis.config.chainId).toBe(31337);
    expect({ ...genesis, config: GENESIS_BLOCK.config }).toEqual(GENESIS_BLOCK);
  });
});

describe("resolveDataDir", () => {
  it("nests the network id under the userData chaindata folder", () => {
    vi.stubEnv("GETH_NETWORK_ID", "4242");
    loadNetworkId();

    expect(resolveDataDir()).toBe(
      join(USER_DATA_DIR, "cointmu-chaindata", "4242"),
    );
  });
});
