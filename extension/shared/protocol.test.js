import { describe, expect, it } from "vitest";
import "./protocol.js";

const { isOpaqueOrigin, isTrustedPageMessage, MessageSource } =
  globalThis.CointMUProtocol;

const ORIGIN = "https://dapp.example";

function fakeWindow(origin = ORIGIN) {
  return { location: { origin } };
}

describe("isOpaqueOrigin", () => {
  it.each([
    ["null", "https:"],
    ["file://", "file:"],
  ])("treats %s (%s) as opaque", (origin, protocol) => {
    expect(isOpaqueOrigin(origin, protocol)).toBe(true);
  });

  it("accepts a normal web origin", () => {
    expect(isOpaqueOrigin(ORIGIN, "https:")).toBe(false);
  });
});

describe("isTrustedPageMessage", () => {
  const win = fakeWindow();
  const data = { source: MessageSource.PAGE, method: "eth_accounts" };

  it("accepts a message the window posted to itself", () => {
    expect(
      isTrustedPageMessage(
        { source: win, origin: ORIGIN, data },
        win,
        MessageSource.PAGE,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "another window (e.g. an iframe)",
      { source: fakeWindow(), origin: ORIGIN, data },
    ],
    ["another origin", { source: win, origin: "https://evil.example", data }],
    [
      "the wrong source tag",
      { source: win, origin: ORIGIN, data: { source: MessageSource.CONTENT } },
    ],
    ["empty data", { source: win, origin: ORIGIN, data: null }],
    ["string data", { source: win, origin: ORIGIN, data: "cointmu-page" }],
  ])("rejects %s", (_label, event) => {
    expect(isTrustedPageMessage(event, win, MessageSource.PAGE)).toBe(false);
  });
});
