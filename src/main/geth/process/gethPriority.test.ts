import { describe, expect, it, vi } from "vitest";
import { constants } from "node:os";
import { applyGethPriority, type PriorityDeps } from "./gethPriority";

const LOW = constants.priority.PRIORITY_BELOW_NORMAL;
const NORMAL = constants.priority.PRIORITY_NORMAL;

function deps(
  platform: NodeJS.Platform,
  overrides: Partial<PriorityDeps> = {},
) {
  return {
    platform,
    setPriority: vi.fn(),
    listThreads: vi.fn(async () => [100, 101, 102]),
    findWindowsChild: vi.fn(async () => 200),
    ...overrides,
  };
}

function systemError(code: string): Error {
  return Object.assign(new Error(code), {
    code: "ERR_SYSTEM_ERROR",
    info: { code },
  });
}

describe("applyGethPriority", () => {
  it("renices every geth thread on Linux", async () => {
    const os = deps("linux");

    expect(await applyGethPriority(100, true, os)).toBe("applied");
    expect(vi.mocked(os.setPriority).mock.calls).toEqual([
      [100, LOW],
      [101, LOW],
      [102, LOW],
    ]);
  });

  it("sets the supervisor and its geth.exe to below normal on Windows", async () => {
    const os = deps("win32");

    await applyGethPriority(50, true, os);

    expect(os.findWindowsChild).toHaveBeenCalledWith(50);
    expect(vi.mocked(os.setPriority).mock.calls).toEqual([
      [50, LOW],
      [200, LOW],
    ]);
  });

  it("sets only the supervisor while its geth.exe is not up yet", async () => {
    const os = deps("win32", { findWindowsChild: vi.fn(async () => null) });

    await applyGethPriority(50, true, os);

    expect(vi.mocked(os.setPriority).mock.calls).toEqual([[50, LOW]]);
  });

  it("sets the process on macOS", async () => {
    const os = deps("darwin");

    await applyGethPriority(70, true, os);

    expect(vi.mocked(os.setPriority).mock.calls).toEqual([[70, LOW]]);
  });

  it("asks for a restart when raising it back needs privileges", async () => {
    const os = deps("linux", {
      setPriority: vi.fn(() => {
        throw systemError("EACCES");
      }),
    });

    expect(await applyGethPriority(100, false, os)).toBe("needs-restart");
    expect(os.setPriority).toHaveBeenCalledWith(100, NORMAL);
  });

  it("skips a thread that ended meanwhile", async () => {
    const os = deps("linux", {
      setPriority: vi.fn((pid: number) => {
        if (pid === 101) throw systemError("ESRCH");
      }),
    });

    expect(await applyGethPriority(100, true, os)).toBe("applied");
    expect(os.setPriority).toHaveBeenCalledTimes(3);
  });
});
