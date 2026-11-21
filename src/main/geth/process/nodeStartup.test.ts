import { beforeEach, describe, expect, it, vi } from "vitest";

type NodeStartup = typeof import("./nodeStartup");

/** Steps that all succeed; a test overrides the one it breaks. */
function okSteps(): Parameters<NodeStartup["runNodeStartup"]>[0] {
  return {
    stopOrphan: vi.fn(async () => undefined),
    initGenesis: vi.fn(async () => undefined),
    prepareIpc: vi.fn(async () => undefined),
    spawn: vi.fn(async () => undefined),
  };
}

describe("runNodeStartup", () => {
  let startup: NodeStartup;

  beforeEach(async () => {
    vi.resetModules();
    startup = await import("./nodeStartup");
  });

  it("is in progress until the startup sequence has run", async () => {
    expect(startup.isStartupInProgress()).toBe(true);
    const steps = okSteps();

    await startup.runNodeStartup(steps);

    expect(steps.spawn).toHaveBeenCalledOnce();
    expect(startup.isStartupInProgress()).toBe(false);
    await expect(startup.whenStartupDone()).resolves.toBeUndefined();
  });

  it("still spawns geth when the orphan stop throws, then opens the gate", async () => {
    const steps = {
      ...okSteps(),
      stopOrphan: vi.fn(async () => {
        throw new Error("EPERM");
      }),
    };

    await startup.runNodeStartup(steps);

    expect(steps.spawn).toHaveBeenCalledOnce();
    expect(startup.isStartupInProgress()).toBe(false);
  });

  it("opens the gate when the spawn throws, and passes the error on", async () => {
    const steps = {
      ...okSteps(),
      spawn: vi.fn(async () => {
        throw new Error("spawn failed");
      }),
    };

    await expect(startup.runNodeStartup(steps)).rejects.toThrow("spawn failed");

    expect(startup.isStartupInProgress()).toBe(false);
    await expect(startup.whenStartupDone()).resolves.toBeUndefined();
  });

  it("refuses with NODE_STARTING while startup runs", async () => {
    expect(() => startup.assertNodeStarted()).toThrow("NODE_STARTING");

    await startup.runNodeStartup(okSteps());

    expect(() => startup.assertNodeStarted()).not.toThrow();
  });
});
