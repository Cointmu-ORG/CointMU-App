import { beforeEach, describe, expect, it, vi } from "vitest";
import { Mnemonic } from "ethers";
import { IpcErrorCode } from "@bridge/types";
import type { DerivedAccount } from "@/entities/account/@x/wallet";
import {
  decryptSecret,
  deriveAccount,
  deriveAccountFromPrivateKey,
  encryptSecret,
  generateKeystore,
  generateMnemonic,
  importKeystore,
  purgeSecondaryAccounts,
  revealPrivateKey,
  revealRecoveryPhrase,
  verifyPassword,
} from "./wallet.service";

vi.mock("i18next", () => ({ default: { t: (key: string) => `t:${key}` } }));

// Public Hardhat/Anvil test vector, so the expected keys do not come from the
// library under test.
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const VECTOR = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
];
const PASSWORD = "correct horse battery";
const WRONG_PASSWORD = "wrong horse battery";
const MNEMONIC_WORDS = 12;
// ethers' keystore encryption runs scrypt with its default (slow) cost.
const KEYSTORE_TIMEOUT_MS = 60_000;

/**
 * Rejects the way ipcRenderer.invoke does: Electron wraps the main error.
 */
function ipcError(channel: string, code: IpcErrorCode): Error {
  return new Error(`Error invoking remote method '${channel}': Error: ${code}`);
}

/**
 * Stands in for the main-process crypto (covered by crypto.test.ts) with its
 * contract: decrypt rejects with a code, verify resolves to a boolean. Plus an
 * in-memory settings store.
 */
function installApi(settings: Map<string, unknown>): void {
  const decrypt = async (payload: string, password: string) => {
    let parsed: { secret: string; password: string };
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw ipcError("wallet:decrypt", IpcErrorCode.WALLET_CORRUPT);
    }
    if (parsed.password !== password) {
      throw ipcError("wallet:decrypt", IpcErrorCode.WALLET_INCORRECT_PASSWORD);
    }
    return parsed.secret;
  };
  vi.stubGlobal("window", {
    api: {
      wallet: {
        encrypt: async (secret: string, password: string) =>
          JSON.stringify({ secret, password }),
        decrypt,
        verify: (payload: string, password: string) =>
          decrypt(payload, password).then(
            () => true,
            () => false,
          ),
      },
      settings: {
        get: async (key: string) => settings.get(key),
        set: vi.fn(async (key: string, value: unknown) => {
          settings.set(key, value);
        }),
      },
    },
  });
}

const account = (index: number, extra?: Partial<DerivedAccount>) => ({
  index,
  address: VECTOR[index].address,
  label: `Account ${index + 1}`,
  ...extra,
});

describe("wallet.service", () => {
  const settings = new Map<string, unknown>();

  beforeEach(() => {
    settings.clear();
    installApi(settings);
  });

  describe("key derivation", () => {
    it("generates a fresh valid 12-word mnemonic each time", () => {
      const first = generateMnemonic();
      const second = generateMnemonic();

      expect(first.split(" ")).toHaveLength(MNEMONIC_WORDS);
      expect(Mnemonic.isValidMnemonic(first)).toBe(true);
      expect(second).not.toBe(first);
    });

    it("derives BIP44 accounts m/44'/60'/0'/0/i from a mnemonic", () => {
      expect(deriveAccount(TEST_MNEMONIC, 0, "Main")).toEqual({
        index: 0,
        address: VECTOR[0].address,
        label: "Main",
      });
      expect(deriveAccount(TEST_MNEMONIC, 1, "Second").address).toBe(
        VECTOR[1].address,
      );
    });

    it("derives an account from a raw private key at index 0", () => {
      expect(
        deriveAccountFromPrivateKey(VECTOR[1].privateKey, "Imported"),
      ).toEqual({ index: 0, address: VECTOR[1].address, label: "Imported" });
    });

    it("rejects an invalid private key", () => {
      expect(() => deriveAccountFromPrivateKey("0x1234", "Bad")).toThrow();
    });
  });

  describe("secret encryption", () => {
    it("round-trips a secret and verifies the password", async () => {
      const payload = await encryptSecret(TEST_MNEMONIC, PASSWORD);

      await expect(decryptSecret(payload, PASSWORD)).resolves.toBe(
        TEST_MNEMONIC,
      );
      await expect(verifyPassword(payload, PASSWORD)).resolves.toBe(true);
      await expect(verifyPassword(payload, WRONG_PASSWORD)).resolves.toBe(
        false,
      );
    });

    it("localizes a wrong password and keeps the IPC error as the cause", async () => {
      const payload = await encryptSecret(TEST_MNEMONIC, PASSWORD);

      const error = await decryptSecret(payload, WRONG_PASSWORD).catch(
        (e: Error) => e,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "t:common:errors.WALLET_INCORRECT_PASSWORD",
      );
      expect(String((error as Error).cause)).toContain("wallet:decrypt");
    });

    it("localizes a corrupt payload by its code", async () => {
      await expect(decryptSecret("not json", PASSWORD)).rejects.toThrow(
        "t:common:errors.WALLET_CORRUPT",
      );
    });

    it("falls back to the generic message for an uncoded failure", async () => {
      window.api.wallet.decrypt = async () => {
        throw new Error("Error invoking remote method 'wallet:decrypt': boom");
      };

      await expect(decryptSecret("{}", PASSWORD)).rejects.toThrow(
        "t:common:errors.decryptFailed",
      );
    });
  });

  describe("revealPrivateKey", () => {
    it("derives a mnemonic account's key at its own index", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );

      await expect(revealPrivateKey(account(0), PASSWORD)).resolves.toBe(
        VECTOR[0].privateKey,
      );
      await expect(revealPrivateKey(account(1), PASSWORD)).resolves.toBe(
        VECTOR[1].privateKey,
      );
    });

    it("decrypts an imported account's own key, not the wallet payload", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );
      const imported = account(1, {
        index: 0,
        encryptedKey: await encryptSecret(VECTOR[1].privateKey, PASSWORD),
      });

      await expect(revealPrivateKey(imported, PASSWORD)).resolves.toBe(
        VECTOR[1].privateKey,
      );
    });

    it("returns the key of a wallet created from a private key", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(VECTOR[0].privateKey, PASSWORD),
      );

      await expect(revealPrivateKey(account(0), PASSWORD)).resolves.toBe(
        VECTOR[0].privateKey,
      );
    });

    it("rejects a wrong password with the localized message", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );

      await expect(
        revealPrivateKey(account(0), WRONG_PASSWORD),
      ).rejects.toThrow("t:common:errors.WALLET_INCORRECT_PASSWORD");
    });

    it("rejects when no wallet is stored", async () => {
      await expect(revealPrivateKey(account(0), PASSWORD)).rejects.toThrow(
        "t:wallet:errors.notUnlocked",
      );
    });
  });

  describe("revealRecoveryPhrase", () => {
    it("returns the stored mnemonic", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );

      await expect(revealRecoveryPhrase(PASSWORD)).resolves.toBe(TEST_MNEMONIC);
    });

    it("refuses a wallet created from a private key", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(VECTOR[0].privateKey, PASSWORD),
      );

      await expect(revealRecoveryPhrase(PASSWORD)).rejects.toThrow(
        "t:wallet:errors.noRecoveryPhrase",
      );
    });

    it("rejects a wrong password and a missing wallet", async () => {
      await expect(revealRecoveryPhrase(PASSWORD)).rejects.toThrow(
        "t:wallet:errors.notUnlocked",
      );
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );
      await expect(revealRecoveryPhrase(WRONG_PASSWORD)).rejects.toThrow(
        "t:common:errors.WALLET_INCORRECT_PASSWORD",
      );
    });
  });

  describe("keystore", () => {
    it(
      "exports a keystore that imports back to the same key, only with its password",
      async () => {
        settings.set(
          "encryptedPayload",
          await encryptSecret(TEST_MNEMONIC, PASSWORD),
        );

        const json = await generateKeystore(account(1), PASSWORD);

        expect(JSON.parse(json).address.toLowerCase()).toBe(
          VECTOR[1].address.slice(2).toLowerCase(),
        );
        await expect(importKeystore(json, PASSWORD)).resolves.toEqual({
          privateKey: VECTOR[1].privateKey,
          address: VECTOR[1].address,
        });
        await expect(importKeystore(json, WRONG_PASSWORD)).rejects.toThrow();
      },
      KEYSTORE_TIMEOUT_MS,
    );

    it("does not export when the wallet password is wrong", async () => {
      settings.set(
        "encryptedPayload",
        await encryptSecret(TEST_MNEMONIC, PASSWORD),
      );

      await expect(
        generateKeystore(account(0), WRONG_PASSWORD),
      ).rejects.toThrow("t:common:errors.WALLET_INCORRECT_PASSWORD");
    });

    it("rejects malformed keystore JSON", async () => {
      await expect(importKeystore("{}", PASSWORD)).rejects.toThrow();
    });
  });

  describe("purgeSecondaryAccounts", () => {
    it("keeps only the first account", async () => {
      settings.set("accounts", [account(0), account(1)]);

      await purgeSecondaryAccounts();

      expect(settings.get("accounts")).toEqual([account(0)]);
    });

    it("writes nothing when there are no accounts", async () => {
      await purgeSecondaryAccounts();

      expect(window.api.settings.set).not.toHaveBeenCalled();
    });
  });
});
