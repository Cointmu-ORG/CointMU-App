import { describe, expect, it } from "vitest";
import {
  MAX_ADDRESS_NAMES,
  MAX_ADDRESS_NAME_LENGTH,
  isAddressNames,
  normalizeAddressName,
  toAddressNameKey,
} from "./address-names";

const ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("normalizeAddressName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeAddressName("  Alice   Smith ")).toBe("Alice Smith");
  });

  it("returns null for an empty, too long or control-character name", () => {
    expect(normalizeAddressName("   ")).toBeNull();
    expect(
      normalizeAddressName("a".repeat(MAX_ADDRESS_NAME_LENGTH + 1)),
    ).toBeNull();
    expect(normalizeAddressName("Ali\u0000ce")).toBeNull();
  });

  it.each([
    ["right-to-left override", "Alice\u202Eecila"],
    ["left-to-right isolate", "Ali\u2066ce"],
    ["zero-width space", "Ali\u200Bce"],
    ["byte order mark", "\uFEFFAlice"],
  ])("returns null for a name with a %s", (_, name) => {
    expect(normalizeAddressName(name)).toBeNull();
  });

  it("accepts emoji, ZWJ emoji and CJK names", () => {
    expect(normalizeAddressName("Bob 🚀")).toBe("Bob 🚀");
    expect(normalizeAddressName("👨\u200D👩\u200D👧 Family")).toBe(
      "👨\u200D👩\u200D👧 Family",
    );
    expect(normalizeAddressName("田中さん")).toBe("田中さん");
  });

  it("accepts a name at the length cap", () => {
    const name = "a".repeat(MAX_ADDRESS_NAME_LENGTH);
    expect(normalizeAddressName(name)).toBe(name);
  });
});

describe("toAddressNameKey", () => {
  it("lowercases a valid address and rejects anything else", () => {
    expect(toAddressNameKey(ADDRESS.toUpperCase().replace("0X", "0x"))).toBe(
      ADDRESS,
    );
    expect(toAddressNameKey("alice.eth")).toBeNull();
    expect(toAddressNameKey("0x1234")).toBeNull();
  });
});

describe("isAddressNames", () => {
  it("accepts a map of lowercase addresses to valid names", () => {
    expect(isAddressNames({})).toBe(true);
    expect(isAddressNames({ [ADDRESS]: "Alice" })).toBe(true);
  });

  it("rejects bad keys, bad names and non-objects", () => {
    expect(isAddressNames({ [ADDRESS.toUpperCase()]: "Alice" })).toBe(false);
    expect(isAddressNames({ [ADDRESS]: " Alice" })).toBe(false);
    expect(isAddressNames({ [ADDRESS]: 1 })).toBe(false);
    expect(isAddressNames([])).toBe(false);
    expect(isAddressNames(null)).toBe(false);
  });

  it(`rejects more than ${MAX_ADDRESS_NAMES} names`, () => {
    const names = Object.fromEntries(
      Array.from({ length: MAX_ADDRESS_NAMES + 1 }, (_, i) => [
        "0x" + i.toString(16).padStart(40, "0"),
        "n",
      ]),
    );
    expect(isAddressNames(names)).toBe(false);
  });
});
