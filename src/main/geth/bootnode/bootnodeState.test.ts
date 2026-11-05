import { describe, expect, it } from "vitest";
import { SigningKey, toBeHex } from "ethers";
import { BootnodeSource } from "../../../bridge/types";
import {
  BootnodeConfigProblem,
  FALLBACK_BOOTNODE_ENODES,
  resolveBuildBootnodes,
} from "./bootnode";
import {
  BOOTNODES_SETTING_KEY,
  EMPTY_BOOTNODE_SETTINGS,
} from "./bootnodeSettings";
import { buildBootnodeState, resolveBootnodeConfig } from "./bootnodeState";

/** An enode whose key is the public key of private key `seed`. */
function enodeFor(seed: number): string {
  const nodeId = new SigningKey(toBeHex(seed, 32)).publicKey.slice(4);
  return `enode://${nodeId}@10.0.9.${seed}:30303`;
}

const DEFAULTS = FALLBACK_BOOTNODE_ENODES;
const FALLBACK_DEFAULTS = resolveBuildBootnodes(undefined);
const CUSTOM = enodeFor(1);
const OTHER_CUSTOM = enodeFor(2);

function storeWith(saved: unknown): { get: (key: string) => unknown } {
  return { get: (key) => (key === BOOTNODES_SETTING_KEY ? saved : undefined) };
}

describe("resolveBootnodeConfig", () => {
  it("uses the defaults unchanged when the user changed nothing", () => {
    expect(
      resolveBootnodeConfig(EMPTY_BOOTNODE_SETTINGS, FALLBACK_DEFAULTS),
    ).toBe(FALLBACK_DEFAULTS);
  });

  it("lists the enabled defaults, then the custom nodes", () => {
    const saved = {
      custom: [
        { enode: CUSTOM, label: "" },
        { enode: OTHER_CUSTOM, label: "" },
      ],
      disabled: [DEFAULTS[1]],
    };

    expect(resolveBootnodeConfig(saved, FALLBACK_DEFAULTS)).toEqual({
      enodes: [DEFAULTS[0], DEFAULTS[2], CUSTOM, OTHER_CUSTOM],
      source: BootnodeSource.USER,
      problem: null,
    });
  });

  it("keeps the build defaults and reports an invalid saved value", () => {
    const buildDefaults = resolveBuildBootnodes(CUSTOM);

    expect(resolveBootnodeConfig({ custom: 1 }, buildDefaults)).toEqual({
      ...buildDefaults,
      problem: BootnodeConfigProblem.INVALID_USER_VALUE,
    });
  });
});

describe("buildBootnodeState", () => {
  const SAVED = {
    custom: [{ enode: CUSTOM, label: "Lab" }],
    disabled: [DEFAULTS[2]],
  };

  it("lists every default, enabled or not, then the custom nodes", () => {
    const state = buildBootnodeState(storeWith(SAVED), FALLBACK_DEFAULTS, null);

    expect(
      state.nodes.map(({ host, label, isDefault, isEnabled }) => ({
        host,
        label,
        isDefault,
        isEnabled,
      })),
    ).toEqual([
      { host: "10.64.24.101", label: "", isDefault: true, isEnabled: true },
      { host: "10.64.24.106", label: "", isDefault: true, isEnabled: true },
      { host: "10.64.24.113", label: "", isDefault: true, isEnabled: false },
      { host: "10.0.9.1", label: "Lab", isDefault: false, isEnabled: true },
    ]);
    expect(state.nodes.map((node) => node.enode)).toEqual([
      ...DEFAULTS,
      CUSTOM,
    ]);
    expect(state).toMatchObject({
      source: BootnodeSource.USER,
      isRestartPending: false,
    });
  });

  it("needs no restart when nodes were only added", () => {
    const added = { custom: [{ enode: CUSTOM, label: "" }], disabled: [] };

    expect(
      buildBootnodeState(storeWith(added), FALLBACK_DEFAULTS, FALLBACK_DEFAULTS)
        .isRestartPending,
    ).toBe(false);
  });

  it("reports a restart as pending while a disabled node is still a running bootnode", () => {
    expect(
      buildBootnodeState(storeWith(SAVED), FALLBACK_DEFAULTS, FALLBACK_DEFAULTS)
        .isRestartPending,
    ).toBe(true);
  });
});
