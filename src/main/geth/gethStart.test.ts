import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeBlockReason } from "../../bridge/types";
import { initAndSpawnGeth } from "./gethStart";
import { initGethIfNeeded } from "./gethInit";
import { getNodeRecovery, spawnGethProcess } from "./gethProcess";
import type { AppStore } from "../services/appStore";

const { handleStartFailure } = vi.hoisted(() => ({
  handleStartFailure: vi.fn(),
}));

vi.mock("./gethInit", () => ({ initGethIfNeeded: vi.fn() }));
vi.mock("./gethProcess", () => ({
  spawnGethProcess: vi.fn(),
  getNodeRecovery: vi.fn(() => ({ handleStartFailure })),
}));
vi.mock("./networkConfig", () => ({ resolveDataDir: () => "/data" }));

const store = {} as AppStore;

/** A system error as Node reports it, e.g. code "EACCES" from syscall "mkdir". */
function errnoError(code: string, syscall: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${syscall} ${code}`), { code, syscall });
}

describe("initAndSpawnGeth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("spawns geth after a successful init", async () => {
    vi.mocked(initGethIfNeeded).mockResolvedValue();

    const isStarted = await initAndSpawnGeth(store);

    expect(isStarted).toBe(true);
    expect(initGethIfNeeded).toHaveBeenCalledWith("/data");
    expect(spawnGethProcess).toHaveBeenCalledWith(store);
    expect(handleStartFailure).not.toHaveBeenCalled();
  });

  it("blocks without spawning when init fails", async () => {
    vi.mocked(initGethIfNeeded).mockRejectedValue(
      new Error("Geth init failed with code 1"),
    );

    const isStarted = await initAndSpawnGeth(store);

    expect(isStarted).toBe(false);
    expect(spawnGethProcess).not.toHaveBeenCalled();
    expect(handleStartFailure).toHaveBeenCalledWith(
      NodeBlockReason.GENESIS_INIT_FAILED,
    );
  });

  it("blocks with the spawn reason when the init binary cannot run", async () => {
    vi.mocked(initGethIfNeeded).mockRejectedValue(
      errnoError("EACCES", "spawn /app/bin/geth"),
    );

    await initAndSpawnGeth(store);

    expect(spawnGethProcess).not.toHaveBeenCalled();
    expect(handleStartFailure).toHaveBeenCalledWith(
      NodeBlockReason.GETH_NOT_EXECUTABLE,
    );
  });

  it("does not blame geth for a datadir permission error", async () => {
    vi.mocked(initGethIfNeeded).mockRejectedValue(
      errnoError("EACCES", "mkdir"),
    );

    await initAndSpawnGeth(store);

    expect(spawnGethProcess).not.toHaveBeenCalled();
    expect(handleStartFailure).toHaveBeenCalledWith(
      NodeBlockReason.GENESIS_INIT_FAILED,
    );
  });

  it("still skips the spawn before recovery is attached", async () => {
    vi.mocked(getNodeRecovery).mockReturnValueOnce(null);
    vi.mocked(initGethIfNeeded).mockRejectedValue(new Error("disk full"));

    await expect(initAndSpawnGeth(store)).resolves.toBe(false);
    expect(spawnGethProcess).not.toHaveBeenCalled();
  });
});
