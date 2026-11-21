import { normalizeAddressName, toAddressNameKey } from "@bridge/address-names";

/** Why the address name form cannot be saved; also the i18n key suffix. */
export const AddressNameFormError = {
  INVALID_ADDRESS: "invalidAddress",
  INVALID_NAME: "invalidName",
  OWN_ACCOUNT: "ownAccount",
} as const;

export type AddressNameFormError =
  (typeof AddressNameFormError)[keyof typeof AddressNameFormError];

export type AddressNameFormResult =
  | { readonly address: string; readonly name: string }
  | { readonly error: AddressNameFormError };

/**
 * @param addressInput - The address as typed.
 * @param nameInput - The name as typed.
 * @param ownAddresses - The wallet's accounts, which are renamed on the
 *   account card instead, so one address never has two names.
 * @returns The address and normalized name to save, or why they cannot be.
 */
export function checkAddressNameForm(
  addressInput: string,
  nameInput: string,
  ownAddresses: readonly string[],
): AddressNameFormResult {
  const address = addressInput.trim();
  const key = toAddressNameKey(address);
  if (key === null) return { error: AddressNameFormError.INVALID_ADDRESS };
  if (ownAddresses.some((own) => own.toLowerCase() === key)) {
    return { error: AddressNameFormError.OWN_ACCOUNT };
  }
  const name = normalizeAddressName(nameInput);
  if (name === null) return { error: AddressNameFormError.INVALID_NAME };
  return { address, name };
}
