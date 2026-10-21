import { describe, expect, it } from "vitest";
import { NodeBlockReason } from "../../bridge/types";
import { classifySpawnError } from "./gethSpawnError";

describe("classifySpawnError", () => {
  it.each([
    [{ code: "ENOENT", errno: -2 }, NodeBlockReason.GETH_NOT_FOUND],
    [{ code: "EACCES", errno: -13 }, NodeBlockReason.GETH_NOT_EXECUTABLE],
    [{ code: "ENOEXEC", errno: -8 }, NodeBlockReason.GETH_WRONG_ARCH],
  ])("classifies %o on any platform", (err, reason) => {
    expect(classifySpawnError(err, "linux")).toBe(reason);
    expect(classifySpawnError(err, "darwin")).toBe(reason);
  });

  it("classifies the macOS Bad CPU type errno as a wrong architecture", () => {
    const err = { code: "Unknown system error -86", errno: -86 };

    expect(classifySpawnError(err, "darwin")).toBe(
      NodeBlockReason.GETH_WRONG_ARCH,
    );
  });

  it("ignores errno -86 off macOS, where it means something else", () => {
    expect(classifySpawnError({ errno: -86 }, "linux")).toBeNull();
  });

  it.each([
    { code: "EPERM", errno: -1 },
    { code: "EAGAIN" },
    {},
    null,
    "EACCES",
  ])("leaves other errors to the restart loop: %o", (err) => {
    expect(classifySpawnError(err, "darwin")).toBeNull();
  });
});
