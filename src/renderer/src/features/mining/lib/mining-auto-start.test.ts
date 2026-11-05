import { describe, expect, it } from "vitest";
import { MiningAutoStartPhase } from "@bridge/types";
import { secondsUntilStart } from "./mining-auto-start.hook";

const STARTS_AT = 1_000_000;

describe("secondsUntilStart", () => {
  it("counts whole seconds down to the start", () => {
    const state = {
      phase: MiningAutoStartPhase.COUNTDOWN,
      startsAt: STARTS_AT,
    };

    expect(secondsUntilStart(state, STARTS_AT - 30_000)).toBe(30);
    expect(secondsUntilStart(state, STARTS_AT - 29_001)).toBe(30);
    expect(secondsUntilStart(state, STARTS_AT - 500)).toBe(1);
    expect(secondsUntilStart(state, STARTS_AT + 2_000)).toBe(0);
  });

  it.each([
    null,
    { phase: MiningAutoStartPhase.WAITING, startsAt: null },
    { phase: MiningAutoStartPhase.DONE, startsAt: null },
    { phase: MiningAutoStartPhase.COUNTDOWN, startsAt: null },
  ])("is null when not counting down (%j)", (state) => {
    expect(secondsUntilStart(state, STARTS_AT)).toBeNull();
  });
});
