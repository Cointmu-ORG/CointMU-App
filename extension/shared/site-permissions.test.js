import { describe, expect, it } from "vitest";
import {
  isOriginConnected,
  isValidOrigin,
  withOrigin,
  withoutOrigin,
} from "./site-permissions.js";

const DAPP = "https://dapp.example";

describe("isValidOrigin", () => {
  it.each([DAPP, "http://localhost:3000"])("accepts %s", (origin) => {
    expect(isValidOrigin(origin)).toBe(true);
  });

  it.each([
    ["an opaque origin", "null"],
    ["a file origin", "file://"],
    ["a full URL", "https://dapp.example/path"],
    ["a non-http scheme", "chrome-extension://abc"],
    ["a non-string", 42],
    ["undefined", undefined],
  ])("rejects %s", (_label, origin) => {
    expect(isValidOrigin(origin)).toBe(false);
  });
});

describe("isOriginConnected", () => {
  it("is true only for a stored origin", () => {
    expect(isOriginConnected([DAPP], DAPP)).toBe(true);
    expect(isOriginConnected([DAPP], "https://evil.example")).toBe(false);
  });

  it("treats a different port as a different origin", () => {
    expect(
      isOriginConnected(["http://localhost:3000"], "http://localhost:4000"),
    ).toBe(false);
  });

  it("never connects an opaque origin even if stored", () => {
    expect(isOriginConnected(["null"], "null")).toBe(false);
  });
});

describe("withOrigin / withoutOrigin", () => {
  it("adds an origin once", () => {
    expect(withOrigin(withOrigin([], DAPP), DAPP)).toEqual([DAPP]);
  });

  it("removes an origin", () => {
    expect(withoutOrigin([DAPP, "https://b.example"], DAPP)).toEqual([
      "https://b.example",
    ]);
  });
});
