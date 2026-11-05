"use strict";

/**
 * Password-based encryption of the standalone wallet keys (WebCrypto only).
 * PBKDF2-HMAC-SHA256 derives an AES-GCM-256 key; every encryption draws a new
 * random salt and IV. The vault records its schema version and KDF parameters
 * so a later release can raise them and re-encrypt on the next write.
 */

export const VAULT_VERSION = 1;
/** OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256, 600,000 iterations. */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;

const KDF_NAME = "PBKDF2";
const KDF_HASH = "SHA-256";
const CIPHER_NAME = "AES-GCM";
const AES_KEY_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** Refuses absurd counts from a damaged vault instead of hanging the worker. */
const MAX_ITERATIONS = 10_000_000;

export const VaultErrorCode = Object.freeze({
  WRONG_PASSWORD: "WRONG_PASSWORD",
  CORRUPT: "CORRUPT",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
});

export class VaultError extends Error {
  /**
   * @param {string} code - A VaultErrorCode.
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

/**
 * @param {unknown} password
 * @returns {boolean} True when the password is long enough to create a vault.
 */
export function isAcceptablePassword(password) {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  if (typeof text !== "string") {
    throw new VaultError(VaultErrorCode.CORRUPT, "Vault field is not text.");
  }
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    throw new VaultError(VaultErrorCode.CORRUPT, "Vault field is not base64.");
  }
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    KDF_NAME,
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: KDF_NAME, hash: KDF_HASH, salt, iterations },
    material,
    { name: CIPHER_NAME, length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a JSON-serializable value.
 * @param {unknown} value - What to protect.
 * @param {string} password - The vault password.
 * @param {{ iterations?: number }} [options] - Tests lower the count; the
 * extension always uses PBKDF2_ITERATIONS.
 * @returns {Promise<Object>} The vault record to store.
 */
export async function encryptVault(
  value,
  password,
  { iterations = PBKDF2_ITERATIONS } = {},
) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const data = await crypto.subtle.encrypt(
    { name: CIPHER_NAME, iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    v: VAULT_VERSION,
    kdf: { name: KDF_NAME, hash: KDF_HASH, iterations, salt: toBase64(salt) },
    cipher: { name: CIPHER_NAME, iv: toBase64(iv) },
    data: toBase64(new Uint8Array(data)),
  };
}

function readParameters(vault) {
  if (!vault || typeof vault !== "object") {
    throw new VaultError(VaultErrorCode.CORRUPT, "Vault is missing.");
  }
  if (vault.v !== VAULT_VERSION) {
    throw new VaultError(
      VaultErrorCode.UNSUPPORTED_VERSION,
      `Unsupported vault version: ${vault.v}`,
    );
  }
  const { kdf, cipher } = vault;
  if (
    kdf?.name !== KDF_NAME ||
    kdf.hash !== KDF_HASH ||
    cipher?.name !== CIPHER_NAME
  ) {
    throw new VaultError(
      VaultErrorCode.UNSUPPORTED_VERSION,
      "Unsupported vault algorithm.",
    );
  }
  const { iterations } = kdf;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new VaultError(VaultErrorCode.CORRUPT, "Invalid KDF iterations.");
  }
  if (iterations > MAX_ITERATIONS) {
    throw new VaultError(VaultErrorCode.CORRUPT, "KDF iterations too high.");
  }
  const salt = fromBase64(kdf.salt);
  const iv = fromBase64(cipher.iv);
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES) {
    throw new VaultError(VaultErrorCode.CORRUPT, "Invalid salt or IV length.");
  }
  return { iterations, salt, iv, data: fromBase64(vault.data) };
}

/**
 * Decrypts a vault record.
 * @param {Object} vault - As returned by encryptVault.
 * @param {string} password
 * @returns {Promise<unknown>} The stored value.
 * @throws {VaultError} WRONG_PASSWORD when authentication fails (AES-GCM
 * cannot tell a wrong password from altered ciphertext), CORRUPT for a
 * malformed record, UNSUPPORTED_VERSION for an unknown schema or algorithm.
 */
export async function decryptVault(vault, password) {
  const { iterations, salt, iv, data } = readParameters(vault);
  const key = await deriveKey(password, salt, iterations);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: CIPHER_NAME, iv },
      key,
      data,
    );
  } catch {
    throw new VaultError(
      VaultErrorCode.WRONG_PASSWORD,
      "Wrong password, or the vault data is damaged.",
    );
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new VaultError(VaultErrorCode.CORRUPT, "Vault content is not JSON.");
  }
}
