import * as ethers from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DAPP = "https://dapp.example";
const PASSWORD = "correct horse";
/** PBKDF2 at 600,000 iterations takes about half a second per derivation. */
const SLOW_TEST_MS = 30_000;

const first = ethers.Wallet.createRandom();
const second = ethers.Wallet.createRandom();
const LEGACY = [
  { address: first.address, privateKey: first.privateKey },
  { address: second.address, privateKey: second.privateKey },
];

/**
 * storage.local with a switch that makes the next write of one key fail,
 * the way a closed browser or a full disk would interrupt the migration.
 */
function createChromeStub(initialLocal) {
  const local = structuredClone(initialLocal);
  const session = {};
  const failures = new Set();
  const area = (data, isLocal) => ({
    get: async (keys) =>
      structuredClone(
        Object.fromEntries(
          [keys]
            .flat()
            .filter((k) => k in data)
            .map((k) => [k, data[k]]),
        ),
      ),
    set: async (values) => {
      const failing = Object.keys(values).find((k) => failures.has(k));
      if (isLocal && failing) {
        failures.delete(failing);
        throw new Error(`write of ${failing} interrupted`);
      }
      Object.assign(data, structuredClone(values));
    },
    remove: async (keys) => {
      for (const key of [keys].flat()) delete data[key];
    },
  });
  return {
    local,
    session,
    failNextWriteOf: (key) => failures.add(key),
    chrome: {
      runtime: { sendMessage: async () => {} },
      storage: {
        local: area(local, true),
        session: { ...area(session, false), setAccessLevel: async () => {} },
      },
      alarms: { create: async () => {}, clear: async () => true },
      tabs: { query: async () => [], sendMessage: async () => {} },
    },
  };
}

function legacyState() {
  return {
    connectionMode: "standalone",
    activeStandaloneAddress: first.address,
    wallets: LEGACY,
    connectedOrigins: [DAPP],
  };
}

function expectNoPlainKeys(stub) {
  const text = JSON.stringify(stub.local).toLowerCase();
  for (const key of LEGACY) {
    expect(text).not.toContain(key.privateKey.slice(2).toLowerCase());
  }
}

function expectLegacyIntact(stub) {
  expect(stub.local.wallets).toEqual(LEGACY);
}

describe("vault-migration", { timeout: SLOW_TEST_MS }, () => {
  let stub;
  let migration;
  let vault;

  beforeEach(async () => {
    vi.resetModules();
    stub = createChromeStub(legacyState());
    vi.stubGlobal("chrome", stub.chrome);
    vi.stubGlobal("ethers", ethers);
    migration = await import("./vault-migration.js");
    vault = await import("./wallet-vault.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const migrate = (password = PASSWORD, confirmPassword = password) =>
    migration.migrateLegacyWallets({ password, confirmPassword });

  async function expectVaultHoldsLegacyKeys() {
    const { decryptVault } = await import("./vault-crypto.js");
    expect(await decryptVault(stub.local.vault, PASSWORD)).toEqual(LEGACY);
  }

  it("encrypts every plain-text key and keeps only addresses", async () => {
    await migrate();
    expect(stub.local.wallets).toEqual([
      { address: first.address },
      { address: second.address },
    ]);
    expectNoPlainKeys(stub);
    await expectVaultHoldsLegacyKeys();
    expect(await vault.getPrivateKey(second.address)).toBe(second.privateKey);
  });

  it("does nothing when run again", async () => {
    await migrate();
    const migrated = stub.local.vault;
    await migrate("another password");
    expect(stub.local.vault).toBe(migrated);
  });

  it("refuses a weak or unconfirmed password and changes nothing", async () => {
    await expect(migrate("short")).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
    });
    await expect(migrate(PASSWORD, "typo")).rejects.toMatchObject({
      code: "PASSWORD_MISMATCH",
    });
    expect(stub.local.vault).toBeUndefined();
    expectLegacyIntact(stub);
  });

  it("keeps the plain-text keys when the vault write is interrupted", async () => {
    stub.failNextWriteOf("vault");
    await expect(migrate()).rejects.toThrow(/interrupted/);
    expect(stub.local.vault).toBeUndefined();
    expectLegacyIntact(stub);

    await migrate();
    expectNoPlainKeys(stub);
    await expectVaultHoldsLegacyKeys();
  });

  it("finishes after an interruption between the vault and the address list", async () => {
    stub.failNextWriteOf("wallets");
    await expect(migrate()).rejects.toThrow(/interrupted/);
    expect(stub.local.vault).toBeDefined();
    expectLegacyIntact(stub);

    await expect(migrate("not the same")).rejects.toMatchObject({
      code: "WRONG_PASSWORD",
    });
    expectLegacyIntact(stub);

    await migrate();
    expectNoPlainKeys(stub);
    await expectVaultHoldsLegacyKeys();
  });

  it("keeps the plain text when the stored vault does not read back", async () => {
    const realGet = stub.chrome.storage.local.get;
    let vaultReads = 0;
    stub.chrome.storage.local.get = async (keys) => {
      const result = await realGet(keys);
      // The first read finds no vault; the read-back gets a damaged copy.
      if (result.vault && ++vaultReads === 1) result.vault.data = "AAAA";
      return result;
    };
    await expect(migrate()).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
    expectLegacyIntact(stub);
  });

  it("lets an interrupted run start over with a new password", async () => {
    stub.failNextWriteOf("wallets");
    await expect(migrate()).rejects.toThrow(/interrupted/);

    await vault.resetVault();
    expect(stub.local.vault).toBeUndefined();
    expectLegacyIntact(stub);
    expect(stub.local.activeStandaloneAddress).toBe(first.address);

    await migrate("brand new password");
    expectNoPlainKeys(stub);
  });

  it("blocks imports until the plain-text keys are migrated", async () => {
    const extra = ethers.Wallet.createRandom();
    await expect(
      vault.importKey({
        privateKey: extra.privateKey,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "MIGRATION_REQUIRED" });
    expectLegacyIntact(stub);
    expect(stub.local.vault).toBeUndefined();
  });

  it("tells connected dApps the account is usable once migrated", async () => {
    const sent = [];
    stub.chrome.tabs.query = async () => [{ id: 3, url: `${DAPP}/` }];
    stub.chrome.tabs.sendMessage = async (_tabId, message) => {
      sent.push(message);
    };
    await migrate();
    expect(sent.at(-1)).toEqual({
      type: "ACCOUNTS_CHANGED",
      accounts: [first.address],
    });
  });
});
