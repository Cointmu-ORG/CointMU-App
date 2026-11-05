import { describe, expect, it } from "vitest";
import { SigningKey, toBeHex } from "ethers";
import { BootnodeSaveError } from "../../../bridge/types";
import {
  BootnodeConfigProblem,
  FALLBACK_BOOTNODE_ENODES,
  MAX_BOOTNODES,
} from "./bootnode";
import {
  BOOTNODES_SETTING_KEY,
  EMPTY_BOOTNODE_SETTINGS,
  MAX_LABEL_LENGTH,
  type SettingsWriter,
  checkBootnodeSettings,
  isBootnodeSettingKey,
  migrateBootnodeSetting,
  readBootnodeSettings,
} from "./bootnodeSettings";

const PRIVATE_KEY_BYTES = 32;
const UNCOMPRESSED_PREFIX_CHARS = 4; // "0x04"

/** An enode whose key is the public key of private key `seed`. */
function enodeFor(seed: number, host = `10.0.9.${seed}`): string {
  const key = new SigningKey(toBeHex(seed, PRIVATE_KEY_BYTES));
  return `enode://${key.publicKey.slice(UNCOMPRESSED_PREFIX_CHARS)}@${host}:30303`;
}

const DEFAULTS = FALLBACK_BOOTNODE_ENODES;
const CUSTOM = enodeFor(1);

describe("isBootnodeSettingKey", () => {
  it.each([
    BOOTNODES_SETTING_KEY,
    `${BOOTNODES_SETTING_KEY}.custom`,
    "network",
  ])("protects %s", (key) => {
    expect(isBootnodeSettingKey(key)).toBe(true);
  });

  it.each(["network.maxPeers", "network.network", "network.bootnodesExtra"])(
    "leaves %s to the generic setter",
    (key) => {
      expect(isBootnodeSettingKey(key)).toBe(false);
    },
  );
});

describe("checkBootnodeSettings", () => {
  it("accepts custom nodes with trimmed labels and disabled defaults", () => {
    const input = {
      custom: [{ enode: ` ${CUSTOM} `, label: "  Lab  " }],
      disabled: [DEFAULTS[2], DEFAULTS[0], DEFAULTS[0]],
    };

    expect(checkBootnodeSettings(input, DEFAULTS)).toEqual({
      isValid: true,
      settings: {
        custom: [{ enode: CUSTOM, label: "Lab" }],
        disabled: [DEFAULTS[0], DEFAULTS[2]],
      },
    });
  });

  it.each([
    ["a non-object", "enode://x", BootnodeSaveError.INVALID_ENODE],
    ["missing lists", {}, BootnodeSaveError.INVALID_ENODE],
    [
      "a key off the curve",
      {
        custom: [{ enode: `enode://${"ab".repeat(64)}@1.2.3.4:1`, label: "" }],
        disabled: [],
      },
      BootnodeSaveError.INVALID_ENODE,
    ],
    [
      "a disabled enode that is not a default",
      { custom: [], disabled: [CUSTOM] },
      BootnodeSaveError.INVALID_ENODE,
    ],
    [
      "a missing label",
      { custom: [{ enode: CUSTOM }], disabled: [] },
      BootnodeSaveError.INVALID_LABEL,
    ],
    [
      "a label over the limit",
      {
        custom: [{ enode: CUSTOM, label: "x".repeat(MAX_LABEL_LENGTH + 1) }],
        disabled: [],
      },
      BootnodeSaveError.INVALID_LABEL,
    ],
    [
      "a label with a line break",
      { custom: [{ enode: CUSTOM, label: "a\nb" }], disabled: [] },
      BootnodeSaveError.INVALID_LABEL,
    ],
    [
      "every node disabled",
      { custom: [], disabled: [...DEFAULTS] },
      BootnodeSaveError.EMPTY,
    ],
  ])("rejects %s", (_, input, error) => {
    expect(checkBootnodeSettings(input, DEFAULTS)).toEqual({
      isValid: false,
      error,
    });
  });

  it("rejects a node id that is already listed, even at another host", () => {
    const sameKeyAsDefault = DEFAULTS[0].replace("10.64.24.101", "10.0.0.1");
    const duplicates = [
      [{ enode: sameKeyAsDefault, label: "" }],
      [
        { enode: CUSTOM, label: "" },
        { enode: enodeFor(1, "10.0.0.2"), label: "" },
      ],
    ];

    for (const custom of duplicates) {
      expect(checkBootnodeSettings({ custom, disabled: [] }, DEFAULTS)).toEqual(
        {
          isValid: false,
          error: BootnodeSaveError.DUPLICATE,
        },
      );
    }
  });

  it("rejects more than MAX_BOOTNODES nodes in all", () => {
    const custom = Array.from(
      { length: MAX_BOOTNODES - DEFAULTS.length + 1 },
      (_, index) => ({ enode: enodeFor(index + 1), label: "" }),
    );

    expect(checkBootnodeSettings({ custom, disabled: [] }, DEFAULTS)).toEqual({
      isValid: false,
      error: BootnodeSaveError.TOO_MANY,
    });
  });
});

describe("readBootnodeSettings", () => {
  it.each([undefined, null, []])("reads %j as no change", (value) => {
    expect(readBootnodeSettings(value, DEFAULTS)).toEqual({
      settings: EMPTY_BOOTNODE_SETTINGS,
      problem: null,
    });
  });

  it("turns a #70 list into custom nodes, dropping entries that are defaults", () => {
    expect(readBootnodeSettings([DEFAULTS[0], CUSTOM], DEFAULTS)).toEqual({
      settings: { custom: [{ enode: CUSTOM, label: "" }], disabled: [] },
      problem: null,
    });
  });

  it.each([
    ["a #70 list with a bad entry", [CUSTOM, "garbage"]],
    ["a hand-edited object", { custom: "x", disabled: [] }],
  ])("ignores and reports %s", (_, value) => {
    expect(readBootnodeSettings(value, DEFAULTS)).toEqual({
      settings: EMPTY_BOOTNODE_SETTINGS,
      problem: BootnodeConfigProblem.INVALID_USER_VALUE,
    });
  });
});

describe("migrateBootnodeSetting", () => {
  function memoryStore(saved: unknown): SettingsWriter {
    const data = new Map<string, unknown>([[BOOTNODES_SETTING_KEY, saved]]);
    return {
      get: (key) => data.get(key),
      set: (key, value) => data.set(key, value),
    };
  }

  it("rewrites a #70 list once and then leaves it alone", () => {
    const store = memoryStore([CUSTOM]);

    migrateBootnodeSetting(store, DEFAULTS);
    const once = store.get(BOOTNODES_SETTING_KEY);
    migrateBootnodeSetting(store, DEFAULTS);

    expect(once).toEqual({
      custom: [{ enode: CUSTOM, label: "" }],
      disabled: [],
    });
    expect(store.get(BOOTNODES_SETTING_KEY)).toBe(once);
  });

  it("writes an empty #70 list as no change", () => {
    const store = memoryStore([]);

    migrateBootnodeSetting(store, DEFAULTS);

    expect(store.get(BOOTNODES_SETTING_KEY)).toEqual(EMPTY_BOOTNODE_SETTINGS);
  });
});
