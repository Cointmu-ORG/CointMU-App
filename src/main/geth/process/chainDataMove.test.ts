import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteOldChainData,
  moveChainData,
  storedDataRoot,
  type ChainDataMoveDeps,
} from "./chainDataMove";
import { checkTarget, treeStats } from "./chainDataCopy";

let base: string;
let oldRoot: string;

/** A data root like geth's: two networks, nested chaindata, a PID file. */
async function seedRoot(root: string): Promise<void> {
  await mkdir(join(root, "19129", "geth", "chaindata"), { recursive: true });
  await mkdir(join(root, "7013", "geth"), { recursive: true });
  await writeFile(
    join(root, "19129", "geth", "chaindata", "000001.log"),
    "a".repeat(1000),
  );
  await writeFile(join(root, "19129", "geth", "nodekey"), "key");
  await writeFile(join(root, "7013", "geth", "LOCK"), "");
  await writeFile(join(root, "geth.pid"), "4242");
}

function deps(overrides: Partial<ChainDataMoveDeps> = {}) {
  let root = oldRoot;
  return {
    currentRoot: () => root,
    stopNode: vi.fn(() => Promise.resolve()),
    startNode: vi.fn(() => Promise.resolve()),
    saveRoot: vi.fn((next: string) => {
      root = next;
    }),
    freeBytes: vi.fn(() => Promise.resolve(Number.MAX_SAFE_INTEGER)),
    ...overrides,
  };
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "chaindata-move-"));
  oldRoot = join(base, "old");
  await seedRoot(oldRoot);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("moveChainData", () => {
  it("copies everything but the PID file, saves the new root and restarts there", async () => {
    const target = join(base, "new", "chain");
    const hooks = deps();

    const result = await moveChainData(target, hooks);

    expect(result).toEqual({ ok: true, oldRoot });
    expect(hooks.stopNode).toHaveBeenCalledOnce();
    expect(hooks.saveRoot).toHaveBeenCalledWith(target);
    expect(hooks.startNode).toHaveBeenCalledOnce();
    expect(vi.mocked(hooks.stopNode).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(hooks.saveRoot).mock.invocationCallOrder[0],
    );
    expect(await treeStats(target)).toEqual(await treeStats(oldRoot));
    expect(existsSync(join(target, "geth.pid"))).toBe(false);
    expect(
      await readFile(join(target, "19129", "geth", "nodekey"), "utf8"),
    ).toBe("key");
    // The old data stays until the user deletes it.
    expect(existsSync(join(oldRoot, "19129", "geth", "nodekey"))).toBe(true);
  });

  it("refuses a target without room, before stopping anything", async () => {
    const hooks = deps({ freeBytes: vi.fn(() => Promise.resolve(10)) });

    const result = await moveChainData(join(base, "small"), hooks);

    expect(result).toEqual({ ok: false, error: "NOT_ENOUGH_SPACE" });
    expect(hooks.stopNode).not.toHaveBeenCalled();
    expect(hooks.startNode).not.toHaveBeenCalled();
    expect(existsSync(join(base, "small"))).toBe(false);
  });

  it("keeps the old root and removes the partial copy when copying fails midway", async () => {
    const target = join(base, "half");
    const hooks = deps({
      copy: async (_from, to) => {
        await mkdir(join(to, "19129"), { recursive: true });
        await writeFile(join(to, "19129", "partial"), "x");
        throw new Error("EIO: disk unplugged");
      },
    });

    const result = await moveChainData(target, hooks);

    expect(result).toEqual({ ok: false, error: "COPY_FAILED" });
    expect(hooks.saveRoot).not.toHaveBeenCalled();
    expect(hooks.startNode).toHaveBeenCalledOnce();
    expect(hooks.currentRoot()).toBe(oldRoot);
    expect(existsSync(target)).toBe(false);
    expect(await treeStats(oldRoot)).toEqual({ files: 3, bytes: 1003 });
  });

  it("fails verification when the copy is incomplete, and empties a folder it did not create", async () => {
    const target = join(base, "empty-existing");
    await mkdir(target);
    const hooks = deps({
      copy: async (_from, to) => {
        await writeFile(join(to, "only-one"), "x");
      },
    });

    const result = await moveChainData(target, hooks);

    expect(result).toEqual({ ok: false, error: "VERIFY_FAILED" });
    expect(hooks.saveRoot).not.toHaveBeenCalled();
    expect(existsSync(target)).toBe(true);
    expect(await treeStats(target)).toEqual({ files: 0, bytes: 0 });
  });
});

describe("checkTarget", () => {
  it.each([
    ["the same folder", () => oldRoot, "SAME_FOLDER"],
    [
      "a folder inside the current one",
      () => join(oldRoot, "sub"),
      "INSIDE_CURRENT",
    ],
    ["a folder that is not empty", () => base, "NOT_EMPTY"],
  ])("refuses %s", async (_label, target, error) => {
    expect(await checkTarget(oldRoot, target())).toBe(error);
  });

  it("accepts a new folder and an empty one", async () => {
    await mkdir(join(base, "empty"));

    expect(await checkTarget(oldRoot, join(base, "brand", "new"))).toBeNull();
    expect(await checkTarget(oldRoot, join(base, "empty"))).toBeNull();
  });

  it("refuses a file in place of the folder", async () => {
    await writeFile(join(base, "file"), "x");

    expect(await checkTarget(oldRoot, join(base, "file"))).toBe("NOT_EMPTY");
  });
});

describe("after a move", () => {
  it("never deletes the folder in use", async () => {
    await expect(deleteOldChainData(oldRoot, oldRoot)).rejects.toThrow(
      /in use/,
    );
    expect(existsSync(oldRoot)).toBe(true);
  });

  it("deletes the old folder", async () => {
    await deleteOldChainData(oldRoot, join(base, "new"));

    expect(existsSync(oldRoot)).toBe(false);
  });

  it("falls back to the default when the saved folder is gone", () => {
    expect(storedDataRoot("", () => true)).toBeNull();
    expect(storedDataRoot(undefined, () => true)).toBeNull();
    expect(storedDataRoot("/mnt/usb/chain", () => false)).toBeNull();
    expect(storedDataRoot("/mnt/usb/chain", () => true)).toBe("/mnt/usb/chain");
  });
});
