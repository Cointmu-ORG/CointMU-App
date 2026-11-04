import { describe, expect, it } from "vitest";
import { isListenPort } from "./network";

describe("isListenPort", () => {
  it.each([1024, 30303, 65535])("accepts %s", (port) => {
    expect(isListenPort(port)).toBe(true);
  });

  it.each([0, 80, 1023, 65536, 30303.5, "30303", Number.NaN, null, undefined])(
    "rejects %s",
    (value) => {
      expect(isListenPort(value)).toBe(false);
    },
  );
});
