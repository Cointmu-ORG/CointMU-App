import type { ClearStorageDataOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { CLEARED_ELECTRON_STORAGES, clearAppCache } from "./appCache";

// The launch-time startup is over unless a test says otherwise.
const startup = vi.hoisted(() => ({ isInProgress: false }));
vi.mock("../geth/process/nodeStartup", () => ({
  isStartupInProgress: () => startup.isInProgress,
  assertNodeStarted: () => {
    if (startup.isInProgress) throw new Error("NODE_STARTING");
  },
}));

describe("clearAppCache", () => {
  it("refuses while the launch-time startup runs, clearing nothing", async () => {
    startup.isInProgress = true;
    const rebuildExplorerIndex = vi.fn();
    const session = {
      clearCache: vi.fn(async () => {}),
      clearStorageData: vi.fn(async () => {}),
      clearCodeCaches: vi.fn(async () => {}),
    };

    const clearing = clearAppCache({
      session,
      rebuildExplorerIndex,
      resetTokenScan: vi.fn(),
      clearNftMedia: vi.fn(),
    });
    await expect(clearing).rejects.toThrow("NODE_STARTING");
    startup.isInProgress = false;

    expect(rebuildExplorerIndex).not.toHaveBeenCalled();
    expect(session.clearCache).not.toHaveBeenCalled();
  });

  it("clears caches only, never storage holding user data", async () => {
    const session = {
      clearCache: vi.fn(async () => {}),
      clearStorageData: vi.fn(async (_options?: ClearStorageDataOptions) => {}),
      clearCodeCaches: vi.fn(async () => {}),
    };
    const rebuildExplorerIndex = vi.fn();
    const resetTokenScan = vi.fn();
    const clearNftMedia = vi.fn();

    await clearAppCache({
      session,
      rebuildExplorerIndex,
      resetTokenScan,
      clearNftMedia,
    });

    expect(rebuildExplorerIndex).toHaveBeenCalledOnce();
    expect(resetTokenScan).toHaveBeenCalledOnce();
    expect(clearNftMedia).toHaveBeenCalledOnce();
    expect(session.clearCache).toHaveBeenCalledOnce();
    const storages = session.clearStorageData.mock.calls[0][0]?.storages ?? [];
    expect(storages).toEqual([...CLEARED_ELECTRON_STORAGES]);
    for (const kept of ["localstorage", "indexdb", "cookies", "websql"]) {
      expect(storages).not.toContain(kept);
    }
  });
});
