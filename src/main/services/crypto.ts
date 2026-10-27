import { ipcMain } from "electron";
import {
  randomBytes,
  scrypt,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { IpcErrorCode } from "../../bridge/types";

/**
 * Versioned, self-describing encrypted blob persisted to electron-store. Stores
 * only the ciphertext, salt, IV, and GCM auth tag — never the password or the
 * plaintext secret. The KDF parameters are embedded so the format can be tuned
 * later without breaking wallets already on disk.
 */
interface EncryptedPayload {
  v: 1;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  keylen: number;
  salt: string; // base64
  iv: string; // base64
  tag: string; // base64 GCM auth tag
  data: string; // base64 ciphertext
}

const KDF_PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 } as const;

/**
 * Derives a symmetric key from a password and salt using scrypt.
 * @param password - The user-supplied password.
 * @param salt - Per-wallet random salt.
 * @param params - scrypt cost parameters and desired key length.
 * @returns A promise resolving to the derived key bytes.
 */
function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keylen: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must accommodate 128 * N * r bytes for the chosen parameters.
    scrypt(
      password,
      salt,
      params.keylen,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 128 * params.N * params.r * 2,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/**
 * Encrypts a secret (mnemonic or private key) under a password using a scrypt
 * KDF and AES-256-GCM.
 * @param secret - The plaintext secret to protect.
 * @param password - The password used to derive the encryption key.
 * @returns A promise resolving to the serialized EncryptedPayload JSON string.
 */
async function encryptSecret(
  secret: string,
  password: string,
): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12); // 96-bit nonce recommended for GCM
  const key = await deriveKey(password, salt, KDF_PARAMS);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    v: 1,
    kdf: "scrypt",
    N: KDF_PARAMS.N,
    r: KDF_PARAMS.r,
    p: KDF_PARAMS.p,
    keylen: KDF_PARAMS.keylen,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
  return JSON.stringify(payload);
}

/**
 * Decrypts a serialized EncryptedPayload with the supplied password. A wrong
 * password fails the GCM auth tag check and throws WALLET_INCORRECT_PASSWORD.
 * @param payloadJson - The serialized EncryptedPayload string.
 * @param password - The password used to derive the decryption key.
 * @returns A promise resolving to the recovered plaintext secret.
 */
async function decryptSecret(
  payloadJson: string,
  password: string,
): Promise<string> {
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(payloadJson) as EncryptedPayload;
  } catch {
    throw new Error(IpcErrorCode.WALLET_CORRUPT);
  }
  if (payload.v !== 1 || payload.kdf !== "scrypt") {
    throw new Error(IpcErrorCode.WALLET_UNSUPPORTED_FORMAT);
  }
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const key = await deriveKey(password, salt, {
    N: payload.N,
    r: payload.r,
    p: payload.p,
    keylen: payload.keylen,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // A GCM auth failure on final() means a wrong password or tampered data.
    throw new Error(IpcErrorCode.WALLET_INCORRECT_PASSWORD);
  }
}

/**
 * Registers IPC handlers that perform all wallet secret crypto in the main
 * process, so plaintext secrets and passwords never need to live base64-at-rest.
 * @returns {void}
 */
export function registerCryptoHandlers(): void {
  ipcMain.handle("wallet:encrypt", (_, secret: string, password: string) =>
    encryptSecret(secret, password),
  );

  ipcMain.handle("wallet:decrypt", (_, payloadJson: string, password: string) =>
    decryptSecret(payloadJson, password),
  );

  // Verify a password without returning the secret, so the login screen never
  // handles plaintext key material.
  ipcMain.handle(
    "wallet:verify",
    async (_, payloadJson: string, password: string) => {
      try {
        await decryptSecret(payloadJson, password);
        return true;
      } catch {
        return false;
      }
    },
  );
}
