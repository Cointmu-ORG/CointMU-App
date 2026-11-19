import { describe, expect, it, vi } from "vitest";
import { clearLocalCaches, onLocalCachesCleared } from "./local-cache.util";

describe("clearLocalCaches", () => {
  it("tells registered in-memory caches to drop their data", () => {
    const listener = vi.fn();
    const unsubscribe = onLocalCachesCleared(listener);
    clearLocalCaches();
    unsubscribe();
    clearLocalCaches();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
