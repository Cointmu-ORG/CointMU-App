import { describe, expect, it } from "vitest";
import { MAX_ADDRESS_NAME_LENGTH } from "@bridge/address-names";
import {
  AddressNameFormError,
  checkAddressNameForm,
} from "./address-name-form.util";

const OWN = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

describe("checkAddressNameForm", () => {
  it("returns the trimmed address and normalized name", () => {
    expect(checkAddressNameForm(` ${OTHER} `, "  Alice  ", [OWN])).toEqual({
      address: OTHER,
      name: "Alice",
    });
  });

  it("refuses a value that is not an address", () => {
    expect(checkAddressNameForm("alice.eth", "Alice", [OWN])).toEqual({
      error: AddressNameFormError.INVALID_ADDRESS,
    });
  });

  it("refuses an empty or too long name", () => {
    expect(checkAddressNameForm(OTHER, " ", [OWN])).toEqual({
      error: AddressNameFormError.INVALID_NAME,
    });
    expect(
      checkAddressNameForm(OTHER, "a".repeat(MAX_ADDRESS_NAME_LENGTH + 1), [
        OWN,
      ]),
    ).toEqual({ error: AddressNameFormError.INVALID_NAME });
  });

  it("refuses one of the user's own accounts, whatever the case", () => {
    expect(
      checkAddressNameForm(OWN.toUpperCase().replace("0X", "0x"), "Me", [OWN]),
    ).toEqual({
      error: AddressNameFormError.OWN_ACCOUNT,
    });
  });
});
