import { describe, expect, it } from "vitest";
import { GRADIENTS } from "../config/account.constants";
import { generateIdenticonGradient } from "./identicon.util";

const ADDRESS = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";

describe("generateIdenticonGradient", () => {
  it("returns the same gradient for the same address", () => {
    expect(generateIdenticonGradient(ADDRESS)).toBe(
      generateIdenticonGradient(ADDRESS),
    );
  });

  it.each([ADDRESS, "", "0x0", ADDRESS.toLowerCase()])(
    "picks one of the palette gradients for %j",
    (address) => {
      expect(GRADIENTS).toContain(generateIdenticonGradient(address));
    },
  );
});
