import i18next from "i18next";
import { GRADIENTS } from "../config/wallet.constants";
import { Wallet, HDNodeWallet } from "ethers";
import { getSetting, setSetting } from "@/shared/api";

export interface DerivedAccount {
  index: number;
  address: string;
  label: string;
  encryptedKey?: string;
  isHidden?: boolean;
}

/**
 * Generates a new 12-word BIP39 mnemonic seed phrase.
 * @returns The mnemonic phrase string.
 */
export function generateMnemonic(): string {
  const wallet = Wallet.createRandom();
  return wallet.mnemonic!.phrase;
}

/**
 * Derives an Ethereum account from a given mnemonic and index
 * using the standard BIP44 derivation path (m/44'/60'/0'/0/i).
 * @param mnemonic - The BIP39 seed phrase.
 * @param index - The account index to derive.
 * @param label - A user-friendly label for the account.
 * @returns The derived account details.
 */
export function deriveAccount(
  mnemonic: string,
  index: number,
  label: string,
): DerivedAccount {
  const path = `m/44'/60'/0'/0/${index}`;
  const hdNode = HDNodeWallet.fromPhrase(mnemonic, undefined, path);

  return {
    index,
    address: hdNode.address,
    label,
  };
}

/**
 * Derives an Ethereum account from a raw private key.
 * @param privateKey - The hex-encoded private key.
 * @param label - A user-friendly label for the account.
 * @returns The derived account details.
 */
export function deriveAccountFromPrivateKey(
  privateKey: string,
  label: string,
): DerivedAccount {
  const wallet = new Wallet(privateKey);

  return {
    index: 0,
    address: wallet.address,
    label,
  };
}

/**
 * Encrypts a secret (mnemonic or private key) under a password. The KDF and
 * AES-GCM encryption run in the main process so plaintext never lives at rest.
 * @param secret - The plaintext secret to protect.
 * @param password - The password used to derive the encryption key.
 * @returns The serialized encrypted payload to persist.
 */
export function encryptSecret(
  secret: string,
  password: string,
): Promise<string> {
  return window.api.wallet.encrypt(secret, password);
}

/**
 * Decrypts an encrypted payload produced by {@link encryptSecret}. Rejects if
 * the password is incorrect (GCM auth failure) or the payload is corrupt.
 * @param payload - The serialized encrypted payload.
 * @param password - The password used to derive the decryption key.
 * @returns The recovered plaintext secret.
 */
export function decryptSecret(
  payload: string,
  password: string,
): Promise<string> {
  return window.api.wallet.decrypt(payload, password);
}

/**
 * Verifies a password against an encrypted payload without exposing the secret.
 * @param payload - The serialized encrypted payload.
 * @param password - The password to check.
 * @returns True if the password decrypts the payload.
 */
export function verifyPassword(
  payload: string,
  password: string,
): Promise<boolean> {
  return window.api.wallet.verify(payload, password);
}

/**
 * Resolves the raw hex private key for a given account by decrypting the
 * relevant secret with the supplied password and deriving at the account's
 * BIP44 index when the secret is a mnemonic. Imported accounts carry their own
 * encryptedKey; mnemonic-derived accounts decrypt the shared wallet payload.
 * Rejects with 'Incorrect password.' when decryption fails, and with 'Wallet is
 * not unlocked' when no wallet payload is present.
 * @param account - The account whose private key should be revealed.
 * @param password - The password used to decrypt the wallet secret.
 * @returns The 0x-prefixed private key hex string.
 */
export async function revealPrivateKey(
  account: DerivedAccount,
  password: string,
): Promise<string> {
  let secret: string;
  if (account.encryptedKey) {
    secret = await decryptSecret(account.encryptedKey, password);
  } else {
    const encryptedPayload = await getSetting<string | null>(
      "encryptedPayload",
    );
    if (!encryptedPayload) {
      throw new Error(i18next.t("wallet:errors.notUnlocked"));
    }
    secret = await decryptSecret(encryptedPayload, password);
  }

  const wallet =
    secret.split(" ").length === 12
      ? HDNodeWallet.fromPhrase(
          secret,
          undefined,
          `m/44'/60'/0'/0/${account.index}`,
        )
      : new Wallet(secret);

  return wallet.privateKey;
}

/**
 * Decrypts and returns the wallet's 12-word BIP39 recovery phrase. Rejects with
 * 'Incorrect password.' on a wrong password, 'Wallet is not unlocked' when no
 * vault is present, and 'This wallet has no recovery phrase.' for wallets that
 * were imported from a raw private key rather than a mnemonic.
 * @param password - The password used to decrypt the wallet vault.
 * @returns The space-separated 12-word recovery phrase.
 */
export async function revealRecoveryPhrase(password: string): Promise<string> {
  const encryptedPayload = await getSetting<string | null>("encryptedPayload");
  if (!encryptedPayload) {
    throw new Error(i18next.t("wallet:errors.notUnlocked"));
  }
  const secret = await decryptSecret(encryptedPayload, password);
  if (secret.split(" ").length !== 12) {
    throw new Error(i18next.t("wallet:errors.noRecoveryPhrase"));
  }
  return secret;
}

/**
 * Decrypts a standard Web3 Secret Storage keystore JSON using its password. This
 * runs the keystore key-derivation function (scrypt) and is therefore an
 * intentionally async, CPU-intensive operation. Rejects when the password is
 * incorrect or the JSON is malformed.
 * @param keystoreJson - The encrypted keystore JSON string.
 * @param password - The password that protects the keystore.
 * @returns The decrypted account's private key and address.
 */
export async function importKeystore(
  keystoreJson: string,
  password: string,
): Promise<{ privateKey: string; address: string }> {
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
  return { privateKey: wallet.privateKey, address: wallet.address };
}

/**
 * Produces a standard Web3 Secret Storage keystore JSON for the given account by
 * decrypting its private key and re-encrypting it under the supplied password.
 * The result is interoperable with other ethers-based wallets.
 * @param account - The account whose private key should be exported.
 * @param password - The password used to decrypt and re-encrypt the key.
 * @returns The serialized keystore JSON string.
 */
export async function generateKeystore(
  account: DerivedAccount,
  password: string,
): Promise<string> {
  const privateKey = await revealPrivateKey(account, password);
  const wallet = new Wallet(privateKey);
  return wallet.encrypt(password);
}

/**
 * Deterministically generates a Tailwind gradient class string based on an Ethereum address.
 * @param address - The Ethereum address.
 * @returns A Tailwind gradient class string.
 */
export function generateIdenticonGradient(address: string): string[] {
  // Simple hash of the address string to pick a gradient
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Ensure positive index
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

/**
 * Purges all secondary wallets, keeping only the primary wallet at index 0.
 * @returns A promise that resolves when the secondary accounts are removed.
 */
export async function purgeSecondaryAccounts(): Promise<void> {
  const accounts = await getSetting<DerivedAccount[]>("accounts");
  if (accounts && accounts.length > 0) {
    await setSetting("accounts", [accounts[0]]);
  }
}
