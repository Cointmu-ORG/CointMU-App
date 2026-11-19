import type { ClearStorageDataOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { CLEARED_ELECTRON_STORAGES, clearAppCache } from "./appCache";

describe("clearAppCache", () => {
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
