import { describe, expect, it } from "vitest";
import {
  BridgeAccess,
  evaluateBridgeAccess,
  isExtensionOrigin,
} from "./bridgeOrigin";

const PAIRED = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const OTHER_EXTENSION = "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba";

describe("isExtensionOrigin", () => {
  it("accepts a Chromium extension origin", () => {
    expect(isExtensionOrigin(PAIRED)).toBe(true);
  });

  it.each([
    ["a web page", "https://evil.example"],
    ["localhost", "http://localhost:5173"],
    ["an opaque origin", "null"],
    ["a malformed extension id", "chrome-extension://short"],
    [
      "an id with invalid letters",
      "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    ],
    ["a suffix trick", `${PAIRED}.evil.example`],
    ["a missing header", undefined],
  ])("rejects %s", (_label, origin) => {
    expect(isExtensionOrigin(origin)).toBe(false);
  });
});

describe("evaluateBridgeAccess", () => {
  it("marks the paired extension as paired", () => {
    expect(evaluateBridgeAccess(PAIRED, PAIRED)).toBe(BridgeAccess.PAIRED);
  });

  it("lets another extension only pair", () => {
    expect(evaluateBridgeAccess(OTHER_EXTENSION, PAIRED)).toBe(
      BridgeAccess.UNPAIRED,
    );
  });

  it("treats every extension as unpaired before any pairing", () => {
    expect(evaluateBridgeAccess(PAIRED, null)).toBe(BridgeAccess.UNPAIRED);
  });

  it("rejects a web page even if it claims the paired origin elsewhere", () => {
    expect(evaluateBridgeAccess("https://evil.example", PAIRED)).toBe(
      BridgeAccess.REJECTED,
    );
  });
});
