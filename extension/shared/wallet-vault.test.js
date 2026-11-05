import * as ethers from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const DAPP = "https://dapp.example";
const DAPP_TAB_ID = 7;
const PASSWORD = "correct horse";
const AUTO_LOCK_MS = 15 * 60 * 1000;
/** PBKDF2 at 600,000 iterations takes about half a second per derivation. */
const SLOW_TEST_MS = 30_000;

const first = ethers.Wallet.createRandom();
const second = ethers.Wallet.createRandom();

function createArea(data) {
  return {
    get: async (keys) =>
      Object.fromEntries(
        [keys]
          .flat()
          .filter((k) => k in data)
          .map((k) => [k, data[k]]),
      ),
    set: async (values) => {
      Object.assign(data, values);
    },
    remove: async (keys) => {
      for (const key of [keys].flat()) delete data[key];
    },
  };
}

function createChromeStub(initialLocal) {
  const local = { ...initialLocal };
  const session = {};
  const tabMessages = [];
  const setAccessLevel = vi.fn(async () => {});
  return {
    local,
    session,
    tabMessages,
    setAccessLevel,
    chrome: {
      runtime: { id: EXTENSION_ID, sendMessage: async () => {} },
      storage: {
        local: createArea(local),
        session: { ...createArea(session), setAccessLevel },
      },
      alarms: { create: async () => {}, clear: async () => true },
      tabs: {
        query: async () => [{ id: DAPP_TAB_ID, url: `${DAPP}/app` }],
        sendMessage: async (tabId, message) => {
          tabMessages.push({ tabId, message });
        },
      },
    },
  };
}

/** Every key the extension wrote to storage.local, as text. */
function localText(stub) {
  return JSON.stringify(stub.local).toLowerCase();
}

function expectNoPlainKeys(stub) {
  for (const wallet of [first, second]) {
    expect(localText(stub)).not.toContain(wallet.privateKey.slice(2));
  }
}

describe("wallet-vault", { timeout: SLOW_TEST_MS }, () => {
  let stub;
  let vault;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.resetModules();
    stub = createChromeStub({
      connectionMode: "standalone",
      connectedOrigins: [DAPP],
    });
    vi.stubGlobal("chrome", stub.chrome);
    vi.stubGlobal("ethers", ethers);
    vault = await import("./wallet-vault.js");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function importFirst() {
    return vault.importKey({
      privateKey: first.privateKey,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });
  }

  async function expectFailure(promise, code) {
    await expect(promise).rejects.toMatchObject({ code });
  }

  it("creates the vault on the first import and stores no plaintext key", async () => {
    expect(await importFirst()).toBe(first.address);
    expect(stub.local.vault.kdf.iterations).toBe(600_000);
    expect(stub.local.wallets).toEqual([{ address: first.address }]);
    expectNoPlainKeys(stub);
    expect(await vault.getPrivateKey(first.address)).toBe(first.privateKey);
    expect(stub.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  });

  it("refuses a short or unconfirmed password for a new vault", async () => {
    await expectFailure(
      vault.importKey({
        privateKey: first.privateKey,
        password: "1234567",
        confirmPassword: "1234567",
      }),
      "WEAK_PASSWORD",
    );
    await expectFailure(
      vault.importKey({
        privateKey: first.privateKey,
        password: PASSWORD,
        confirmPassword: "different!",
      }),
      "PASSWORD_MISMATCH",
    );
    expect(stub.local.vault).toBeUndefined();
  });

  it("refuses an invalid private key", async () => {
    await expectFailure(
      vault.importKey({
        privateKey: "0x1234",
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }),
      "IMPORT_FAILED",
    );
  });

  it("adds a key only with the vault password, under a new salt", async () => {
    await importFirst();
    const before = stub.local.vault;
    await expectFailure(
      vault.importKey({
        privateKey: second.privateKey,
        password: "wrong pass",
      }),
      "WRONG_PASSWORD",
    );
    expect(stub.local.vault).toBe(before);

    await vault.importKey({
      privateKey: second.privateKey,
      password: PASSWORD,
    });
    expect(stub.local.vault.kdf.salt).not.toBe(before.kdf.salt);
    expect(stub.local.wallets).toEqual([
      { address: first.address },
      { address: second.address },
    ]);
    expectNoPlainKeys(stub);
  });

  it("removes a key only with the vault password", async () => {
    await importFirst();
    await expectFailure(
      vault.removeKey({ address: first.address, password: "wrong pass" }),
      "WRONG_PASSWORD",
    );
    expect(
      await vault.removeKey({ address: first.address, password: PASSWORD }),
    ).toEqual([]);
    expect(await vault.getPrivateKey(first.address)).toBeNull();
  });

  it("locks and unlocks, and tells connected dApps", async () => {
    await importFirst();
    stub.local.activeStandaloneAddress = first.address;

    await vault.lock();
    expect(await vault.getPrivateKey(first.address)).toBeNull();
    expect(stub.session).toEqual({});
    expect(stub.tabMessages.at(-1).message.accounts).toEqual([]);

    await expectFailure(vault.unlock("wrong pass"), "WRONG_PASSWORD");
    await vault.unlock(PASSWORD);
    expect(await vault.getPrivateKey(first.address)).toBe(first.privateKey);
    expect(stub.tabMessages.at(-1)).toEqual({
      tabId: DAPP_TAB_ID,
      message: { type: "ACCOUNTS_CHANGED", accounts: [first.address] },
    });
  });

  it("leaves dApps alone in desktop mode", async () => {
    await importFirst();
    stub.local.connectionMode = "desktop";
    await vault.lock();
    await vault.unlock(PASSWORD);
    expect(stub.tabMessages).toEqual([]);
  });

  it("locks itself after 15 idle minutes; use moves the deadline", async () => {
    await importFirst();
    stub.local.activeStandaloneAddress = first.address;

    vi.advanceTimersByTime(AUTO_LOCK_MS - 1000);
    expect(await vault.getPrivateKey(first.address)).toBe(first.privateKey);
    vi.advanceTimersByTime(AUTO_LOCK_MS - 1000);
    expect(await vault.getPrivateKey(first.address)).toBe(first.privateKey);

    vi.advanceTimersByTime(AUTO_LOCK_MS);
    await vault.handleAutoLockAlarm({ name: "cointmu-auto-lock" });
    expect(await vault.getVaultStatus()).toEqual({
      hasVault: true,
      isLocked: true,
    });
    expect(stub.session).toEqual({});
    expect(stub.tabMessages.at(-1).message.accounts).toEqual([]);
  });

  it("stays unlocked when Chrome restarts the service worker", async () => {
    await importFirst();
    vi.resetModules();
    const restarted = await import("./wallet-vault.js");
    expect(await restarted.getPrivateKey(first.address)).toBe(first.privateKey);
  });

  it("re-encrypts a vault with an older, lower KDF cost on unlock", async () => {
    const { encryptVault } = await import("./vault-crypto.js");
    stub.local.vault = await encryptVault(
      [{ address: first.address, privateKey: first.privateKey }],
      PASSWORD,
      { iterations: 1000 },
    );
    await vault.unlock(PASSWORD);
    expect(stub.local.vault.kdf.iterations).toBe(600_000);
  });

  it("resets to an empty wallet when the password is forgotten", async () => {
    await importFirst();
    await vault.resetVault();
    expect(stub.local.vault).toBeUndefined();
    expect(stub.local.wallets).toEqual([]);
    expect(await vault.getPrivateKey(first.address)).toBeNull();
  });
});
