import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySettingRules, migrateSettingValues } from "./settingsMigration";

// Stores written by released AppImages, run offline in an isolated profile.
// 1.6.18: EUR, the U+FFFD network label, 25 peers, Full, Turbo, Custom pool
// and Debug chosen in its UI. 1.7.1: a custom network added, then Testnet
// chosen (geth ran with --networkid 7013). Only the encrypted key payload is
// redacted.
const snapshot = (version = "1.6.18"): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/store-${version}.fixture.json`, import.meta.url),
      "utf8",
    ),
  );

describe("migrateSettingValues", () => {
  it("converts a real 1.6.18 store to codes", () => {
    const migrated = migrateSettingValues(snapshot());

    expect(migrated).toMatchObject({
      general: { currency: "eur" },
      appearance: { theme: "light", density: "comfortable" },
      network: { syncMode: "full", maxPeers: 25 },
      mining: { intensity: "turbo", miningMode: "Custom pool..." },
      advanced: { logLevel: "debug" },
    });
    expect(migrated?.general).not.toHaveProperty("language");
    expect(migrated?.network).not.toHaveProperty("network");
    expect(migrated?.network).not.toHaveProperty("chainId");
    expect(migrated?.network).not.toHaveProperty("rpcEndpoint");
  });

  it("drops the network choice of a real 1.7.1 store", () => {
    const before = snapshot("1.7.1");

    const migrated = migrateSettingValues(before);

    expect(migrated?.network).toEqual({
      listenPort: (before.network as Record<string, unknown>).listenPort,
      bootnodes: (before.network as Record<string, unknown>).bootnodes,
    });
    // Everything else is untouched, apart from the retired keys.
    expect({
      ...migrated,
      network: before.network,
      appearance: before.appearance,
      mining: before.mining,
    }).toEqual(before);
  });

  it("never carries a stored mining.startAtLaunch true over", () => {
    const store = snapshot("1.7.1");
    const mining: Record<string, unknown> = {
      ...(store.mining as Record<string, unknown>),
      startAtLaunch: true,
    };
    const before = { ...store, mining };

    // The order createAppStore runs them in.
    const migrated = migrateSettingValues(before) ?? before;
    const filled = applySettingRules(migrated) ?? migrated;

    expect(filled.mining).not.toHaveProperty("startAtLaunch");
    expect(filled.mining).toMatchObject({
      autoStartAtLaunch: false,
      poolAddress: mining.poolAddress,
      cpuThreads: mining.cpuThreads,
    });
    expect(migrateSettingValues(filled)).toBeNull();
    expect(applySettingRules(filled)).toBeNull();
  });

  it("keeps an autoStartAtLaunch the user turned on", () => {
    const store = { mining: { autoStartAtLaunch: true, startAtLaunch: true } };

    const migrated = migrateSettingValues(store) ?? store;
    const filled = applySettingRules(migrated) ?? migrated;

    expect(filled.mining).toMatchObject({ autoStartAtLaunch: true });
    expect(filled.mining).not.toHaveProperty("startAtLaunch");
  });

  it.each(["1.6.18", "1.7.1"])(
    "drops the showSidebarColors true a %s store holds",
    (version) => {
      const before = snapshot(version);
      expect(before.appearance).toMatchObject({ showSidebarColors: true });

      const migrated = migrateSettingValues(before);

      expect(migrated?.appearance).not.toHaveProperty("showSidebarColors");
      expect(migrated?.appearance).toMatchObject({ accentColor: "#3b82f6" });
    },
  );

  it("leaves wallet data and unrelated settings untouched", () => {
    const before = snapshot();

    const migrated = migrateSettingValues(before);

    for (const key of [
      "accounts",
      "activeWalletAddress",
      "encryptedPayload",
      "geth",
      "telemetry",
      "notifications",
      "security",
    ]) {
      expect(migrated?.[key]).toEqual(before[key]);
    }
    expect(migrated?.mining).toMatchObject({
      poolAddress: "0x2BC096C7573c73f896DFb3fbb3b9BEa1C8FCE797",
      cpuThreads: 4,
    });
  });

  it.each(["1.6.18", "1.7.1"])("is idempotent on a %s store", (version) => {
    const once = migrateSettingValues(snapshot(version));

    expect(once).not.toBeNull();
    expect(migrateSettingValues(once ?? {})).toBeNull();
  });

  it("does not mutate its input", () => {
    const before = snapshot();

    migrateSettingValues(before);

    expect(before).toEqual(snapshot());
  });

  it.each([
    ["CMU (native)", "cmu"],
    ["USD ($)", "usd"],
    ["EUR (€)", "eur"],
    ["EUR ()", "eur"],
    ["usd", "usd"],
    ["Yen", "cmu"],
    [42, "cmu"],
  ])("maps currency %j to %j", (stored, code) => {
    const data = { general: { currency: stored } };

    const result = migrateSettingValues(data) ?? data;

    expect(result.general).toEqual({ currency: code });
  });

  it.each([
    ["Snap (recommended)", "snap"],
    ["Light", "light"],
    ["constructor", "snap"],
  ])("maps sync mode %j to %j", (stored, code) => {
    const migrated = migrateSettingValues({ network: { syncMode: stored } });

    expect(migrated?.network).toEqual({ syncMode: code });
  });

  it.each([
    ["network", "My lab chain"],
    ["customNetworks", []],
    ["chainId", 1912],
    ["chainId", null],
    ["rpcEndpoint", "https://rpc.cointmu.net"],
  ])("removes network.%s (%j)", (key, value) => {
    expect(
      migrateSettingValues({ network: { [key]: value, maxPeers: 14 } }),
    ).toEqual({ network: { maxPeers: 14 } });
  });

  it("returns null for a store that needs nothing", () => {
    expect(migrateSettingValues({})).toBeNull();
    expect(
      migrateSettingValues({ mining: { intensity: "eco" }, general: {} }),
    ).toBeNull();
  });
});
