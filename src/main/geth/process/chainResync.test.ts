import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChainResyncError } from "../../../bridge/types";
import {
  listChainDataBackups,
  removeChainDataBackups,
} from "../recovery/chaindataQuarantine";
import {
  dropBackupWhenCaughtUp,
  isResyncInProgress,
  resyncFromGenesis,
  type ChainResyncDeps,
} from "./chainResync";

// The launch-time startup is over unless a test says otherwise.
const startup = vi.hoisted(() => ({ isInProgress: false }));
vi.mock("./nodeStartup", () => ({
  isStartupInProgress: () => startup.isInProgress,
  assertNodeStarted: () => {
    if (startup.isInProgress) throw new Error("NODE_STARTING");
  },
}));

const OLD_HEAD = 330_000;
let dataDir = "";

function createDeps(overrides: Partial<ChainResyncDeps> = {}) {
  const calls: string[] = [];
  const deps: ChainResyncDeps = {
    resolveDataDir: () => dataDir,
    readHeadBlock: async () => OLD_HEAD,
    stopNode: vi.fn(async () => void calls.push("stop")),
    hasGethExited: () => true,
    setTokenScanPaused: (isPaused) => calls.push(`tokens:${isPaused}`),
    initGenesis: vi.fn(async () => void calls.push("init")),
    startNode: vi.fn(async () => void calls.push("start")),
    requestIndexRebuild: () => calls.push("index"),
    saveBackupHead: vi.fn(),
    ...overrides,
  };
  return { deps, calls };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "resync-"));
  await mkdir(join(dataDir, "geth", "chaindata", "ancient"), {
    recursive: true,
  });
  await writeFile(join(dataDir, "geth", "chaindata", "000001.ldb"), "x");
  await mkdir(join(dataDir, "keystore"));
  await writeFile(join(dataDir, "keystore", "key.json"), "{}");
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("resyncFromGenesis", () => {
  it("quarantines chaindata, keeps the keystore, and restarts geth", async () => {
    const { deps, calls } = createDeps();

    const result = await resyncFromGenesis(deps);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      "tokens:true",
      "stop",
      "index",
      "init",
      "start",
      "tokens:false",
    ]);
    expect(existsSync(join(dataDir, "geth", "chaindata"))).toBe(false);
    expect(existsSync(join(dataDir, "keystore", "key.json"))).toBe(true);
    expect(await listChainDataBackups(dataDir)).toHaveLength(1);
    expect(deps.saveBackupHead).toHaveBeenCalledWith(OLD_HEAD);
    expect(isResyncInProgress()).toBe(false);
  });

  it("leaves the chain data alone when geth did not exit, but starts it again", async () => {
    const { deps, calls } = createDeps({ hasGethExited: () => false });

    const result = await resyncFromGenesis(deps);

    expect(result).toEqual({
      ok: false,
      error: ChainResyncError.NODE_STILL_RUNNING,
    });
    expect(existsSync(join(dataDir, "geth", "chaindata"))).toBe(true);
    expect(calls).toContain("start");
  });

  it("refuses while the launch-time startup runs, touching nothing", async () => {
    startup.isInProgress = true;
    const { deps, calls } = createDeps();

    const result = await resyncFromGenesis(deps);
    startup.isInProgress = false;

    expect(result).toEqual({
      ok: false,
      error: ChainResyncError.NODE_STARTING,
    });
    expect(calls).toEqual([]);
    expect(await listChainDataBackups(dataDir)).toEqual([]);
  });

  it("refuses a second resync while one runs", async () => {
    let release = (): void => {};
    const { deps } = createDeps({
      stopNode: () => new Promise((resolve) => (release = resolve)),
    });
    const first = resyncFromGenesis(deps);
    await vi.waitFor(() => expect(isResyncInProgress()).toBe(true));

    expect(await resyncFromGenesis(createDeps().deps)).toEqual({
      ok: false,
      error: ChainResyncError.BUSY,
    });
    release();
    await first;
  });

  it("keeps the backup for the button when the old head is unknown", async () => {
    const { deps } = createDeps({ readHeadBlock: async () => null });
    await resyncFromGenesis(deps);
    expect(deps.saveBackupHead).toHaveBeenCalledWith(null);
  });
});

describe("dropBackupWhenCaughtUp", () => {
  it("removes the backup only once the new chain passes the old head", async () => {
    const { deps } = createDeps();
    await resyncFromGenesis(deps);
    let head = OLD_HEAD - 1;
    let mark: number | null = OLD_HEAD;
    const cleanup = {
      readHeadBlock: async () => head,
      readBackupHead: () => mark,
      saveBackupHead: (next: number | null) => (mark = next),
      removeBackups: () => removeChainDataBackups(dataDir),
    };

    expect(await dropBackupWhenCaughtUp(cleanup)).toBe(false);
    head = OLD_HEAD;
    expect(await dropBackupWhenCaughtUp(cleanup)).toBe(true);
    expect(mark).toBeNull();
    expect(await readdir(join(dataDir, "geth"))).toEqual([]);
    expect(existsSync(join(dataDir, "keystore", "key.json"))).toBe(true);
  });
});
