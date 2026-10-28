import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrateSettingValues } from "./settingsMigration";

// A store written by the released 1.6.18 AppImage (run offline in an isolated
// profile; EUR, the U+FFFD network label, 25 peers, Full, Turbo, Custom pool
// and Debug chosen in its UI). Only the encrypted key payload is redacted.
const snapshot = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      new URL("./store-1.6.18.fixture.json", import.meta.url),
      "utf8",
    ),
  );

describe("migrateSettingValues", () => {
  it("converts a real 1.6.18 store to codes", () => {
    const migrated = migrateSettingValues(snapshot());

    expect(migrated).toMatchObject({
      general: { currency: "eur" },
      appearance: { theme: "light", density: "comfortable" },
      network: {
        network: "CointMU Mainnet · chain ID 1912",
        syncMode: "full",
        maxPeers: 25,
      },
      mining: { intensity: "turbo", miningMode: "Custom pool..." },
      advanced: { logLevel: "debug" },
    });
    expect(migrated?.general).not.toHaveProperty("language");
  });

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

  it("is idempotent", () => {
    const once = migrateSettingValues(snapshot());

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

  it("repairs the testnet label and keeps custom network names", () => {
    expect(
      migrateSettingValues({
        network: { network: "CointMU Testnet � chain ID 7013" },
      }),
    ).toEqual({ network: { network: "CointMU Testnet · chain ID 7013" } });
    expect(
      migrateSettingValues({ network: { network: "My lab chain" } }),
    ).toBeNull();
  });

  it("returns null for a store that needs nothing", () => {
    expect(migrateSettingValues({})).toBeNull();
    expect(
      migrateSettingValues({ mining: { intensity: "eco" }, general: {} }),
    ).toBeNull();
  });
});
