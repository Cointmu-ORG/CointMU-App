/**
 * Holds the unlocked wallet password in renderer memory for the duration of a
 * session. Secrets are encrypted at rest (see walletService), so signing and
 * account-derivation flows need the password again to decrypt on demand. This is
 * deliberately in-memory only — it is never persisted and is cleared on lock.
 */
let sessionPassword: string | null = null;

/**
 * Records the password after a successful login, create, or import so later
 * operations can decrypt secrets without re-prompting.
 * @param {string} password - The password that unlocked the wallet.
 * @returns {void}
 */
export function unlockSession(password: string): void {
  sessionPassword = password;
}

/**
 * Returns the password for the currently unlocked session, or null if locked.
 * @returns {string | null} The session password, or null.
 */
export function getSessionPassword(): string | null {
  return sessionPassword;
}

/**
 * Clears the in-memory session password, locking the wallet.
 * @returns {void}
 */
export function lockSession(): void {
  sessionPassword = null;
}
