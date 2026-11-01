import { describe, expect, it } from "vitest";
import { BootnodeSaveError, BootnodeSource } from "../../../bridge/types";
import { MAX_BOOTNODES, resolveBuildBootnodes } from "./bootnode";
import {
  BOOTNODES_SETTING_KEY,
  buildBootnodeState,
  checkBootnodeInput,
  isBootnodeSettingKey,
} from "./bootnodeSettings";

// The secp256k1 generator point G: the public key of private key 1.
const NODE_ID =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const ENODE = `enode://${NODE_ID}@10.0.0.5:30303`;
const SECOND_ENODE = `enode://${NODE_ID}@10.0.0.6:30303`;
const FALLBACK_DEFAULTS = resolveBuildBootnodes(undefined);

function storeWith(saved: unknown): { get: (key: string) => unknown } {
  return { get: (key) => (key === BOOTNODES_SETTING_KEY ? saved : undefined) };
}

describe("isBootnodeSettingKey", () => {
  it.each([BOOTNODES_SETTING_KEY, `${BOOTNODES_SETTING_KEY}.0`, "network"])(
    "protects %s",
    (key) => {
      expect(isBootnodeSettingKey(key)).toBe(true);
    },
  );

  it.each(["network.maxPeers", "network.network", "network.bootnodesExtra"])(
    "leaves %s to the generic setter",
    (key) => {
      expect(isBootnodeSettingKey(key)).toBe(false);
    },
  );
});

describe("checkBootnodeInput", () => {
  it("accepts several enodes, one per line or comma-separated", () => {
    expect(checkBootnodeInput(`${ENODE}\n${SECOND_ENODE}, ${ENODE}`)).toEqual({
      isValid: true,
      enodes: [ENODE, SECOND_ENODE],
    });
  });

  it("rejects the whole list when any entry is invalid, naming each one", () => {
    expect(
      checkBootnodeInput(`${ENODE}\nnot-an-enode\nenode://ab@1.2.3.4:1`),
    ).toEqual({
      isValid: false,
      error: BootnodeSaveError.INVALID_ENODE,
      invalid: [
        { position: 2, value: "not-an-enode" },
        { position: 3, value: "enode://ab@1.2.3.4:1" },
      ],
    });
  });

  it.each([" \n ", undefined, 42])("rejects empty input (%j)", (input) => {
    expect(checkBootnodeInput(input)).toEqual({
      isValid: false,
      error: BootnodeSaveError.EMPTY,
      invalid: [],
    });
  });

  it("rejects more than MAX_BOOTNODES distinct enodes", () => {
    const enodes = Array.from(
      { length: MAX_BOOTNODES + 1 },
      (_, index) => `enode://${NODE_ID}@10.0.1.${index}:30303`,
    );

    expect(checkBootnodeInput(enodes.join("\n"))).toMatchObject({
      isValid: false,
      error: BootnodeSaveError.TOO_MANY,
    });
  });

  it("rejects oversized input without parsing it", () => {
    expect(checkBootnodeInput(ENODE.repeat(100))).toMatchObject({
      isValid: false,
      error: BootnodeSaveError.TOO_MANY,
    });
  });
});

describe("buildBootnodeState", () => {
  it("shows the default bootnodes and no custom list when none is saved", () => {
    expect(buildBootnodeState(storeWith([]), FALLBACK_DEFAULTS, null)).toEqual({
      activeEnodes: FALLBACK_DEFAULTS.enodes,
      source: BootnodeSource.FALLBACK,
      customEnodes: [],
      isRestartPending: false,
    });
  });

  it("shows the saved list as active before the node has started", () => {
    expect(
      buildBootnodeState(storeWith([ENODE]), FALLBACK_DEFAULTS, null),
    ).toEqual({
      activeEnodes: [ENODE],
      source: BootnodeSource.USER,
      customEnodes: [ENODE],
      isRestartPending: false,
    });
  });

  it("keeps showing what the running node uses until it restarts", () => {
    const state = buildBootnodeState(
      storeWith([ENODE]),
      FALLBACK_DEFAULTS,
      FALLBACK_DEFAULTS,
    );

    expect(state).toMatchObject({
      activeEnodes: FALLBACK_DEFAULTS.enodes,
      source: BootnodeSource.FALLBACK,
      customEnodes: [ENODE],
      isRestartPending: true,
    });
  });

  it("hides a saved list that fails validation", () => {
    expect(
      buildBootnodeState(storeWith(["garbage"]), FALLBACK_DEFAULTS, null),
    ).toMatchObject({
      source: BootnodeSource.FALLBACK,
      customEnodes: [],
    });
  });
});
