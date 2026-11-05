import { describe, expect, it } from "vitest";
import {
  PBKDF2_ITERATIONS,
  VAULT_VERSION,
  VaultErrorCode,
  decryptVault,
  encryptVault,
  isAcceptablePassword,
} from "./vault-crypto.js";

const PASSWORD = "correct horse";
const FAST = { iterations: 1000 };
const KEYS = [
  {
    address: "0x0000000000000000000000000000000000000001",
    privateKey: "0x" + "11".repeat(32),
  },
];

function flipFirstByte(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  bytes[0] ^= 0xff;
  return btoa(String.fromCharCode(...bytes));
}

async function expectVaultError(promise, code) {
  await expect(promise).rejects.toMatchObject({ name: "VaultError", code });
}

describe("vault-crypto", () => {
  it("round-trips with the right password and stores no plaintext", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, FAST);
    expect(JSON.stringify(vault)).not.toContain(KEYS[0].privateKey.slice(2));
    expect(await decryptVault(vault, PASSWORD)).toEqual(KEYS);
  });

  it("uses PBKDF2-SHA256 with 600,000 iterations and AES-GCM by default", async () => {
    const vault = await encryptVault(KEYS, PASSWORD);
    expect(vault.v).toBe(VAULT_VERSION);
    expect(vault.kdf).toMatchObject({
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
    });
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(vault.cipher.name).toBe("AES-GCM");
  });

  it("draws a new salt and IV for every encryption", async () => {
    const first = await encryptVault(KEYS, PASSWORD, FAST);
    const second = await encryptVault(KEYS, PASSWORD, FAST);
    expect(second.kdf.salt).not.toBe(first.kdf.salt);
    expect(second.cipher.iv).not.toBe(first.cipher.iv);
    expect(second.data).not.toBe(first.data);
  });

  it("refuses a wrong password", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, FAST);
    await expectVaultError(
      decryptVault(vault, "wrong password"),
      VaultErrorCode.WRONG_PASSWORD,
    );
  });

  it("refuses altered ciphertext", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, FAST);
    await expectVaultError(
      decryptVault({ ...vault, data: flipFirstByte(vault.data) }, PASSWORD),
      VaultErrorCode.WRONG_PASSWORD,
    );
  });

  it("refuses malformed records as corrupt", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, FAST);
    const cases = [
      null,
      { ...vault, data: "%%%" },
      { ...vault, cipher: { ...vault.cipher, iv: btoa("short") } },
      { ...vault, kdf: { ...vault.kdf, iterations: 0 } },
      { ...vault, kdf: { ...vault.kdf, iterations: 1e12 } },
    ];
    for (const record of cases) {
      await expectVaultError(
        decryptVault(record, PASSWORD),
        VaultErrorCode.CORRUPT,
      );
    }
  });

  it("refuses unknown schema versions and algorithms", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, FAST);
    await expectVaultError(
      decryptVault({ ...vault, v: VAULT_VERSION + 1 }, PASSWORD),
      VaultErrorCode.UNSUPPORTED_VERSION,
    );
    await expectVaultError(
      decryptVault(
        { ...vault, kdf: { ...vault.kdf, hash: "SHA-1" } },
        PASSWORD,
      ),
      VaultErrorCode.UNSUPPORTED_VERSION,
    );
  });

  it("decrypts with the iteration count stored in the record", async () => {
    const vault = await encryptVault(KEYS, PASSWORD, { iterations: 2000 });
    expect(vault.kdf.iterations).toBe(2000);
    expect(await decryptVault(vault, PASSWORD)).toEqual(KEYS);
  });

  it("accepts passwords of at least 8 characters", () => {
    expect(isAcceptablePassword("1234567")).toBe(false);
    expect(isAcceptablePassword("12345678")).toBe(true);
    expect(isAcceptablePassword(undefined)).toBe(false);
  });
});
