import { describe, expect, it } from "vitest";
import {
  getSessionPassword,
  lockSession,
  unlockSession,
} from "./wallet-session.service";

describe("wallet session", () => {
  it("starts locked, holds the password once unlocked, and forgets it on lock", () => {
    expect(getSessionPassword()).toBeNull();

    unlockSession("first");
    expect(getSessionPassword()).toBe("first");

    unlockSession("second");
    expect(getSessionPassword()).toBe("second");

    lockSession();
    expect(getSessionPassword()).toBeNull();
  });

  it("stays locked when locked twice", () => {
    lockSession();
    lockSession();

    expect(getSessionPassword()).toBeNull();
  });
});
