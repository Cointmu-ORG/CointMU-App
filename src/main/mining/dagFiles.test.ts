import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RecoveryPathError,
  assertSafeDagFile,
} from "../geth/recovery/recoveryPathGuard";
import {
  dagSizeBytes,
  deleteDagFiles,
  listDagFiles,
  resolveDagDir,
} from "./dagFiles";

const DAG = "full-R23-290decd9548b62a8";
let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dag-"));
  await writeFile(join(dir, DAG), "12345");
  await writeFile(join(dir, `${DAG}.123`), "1");
  await writeFile(join(dir, "notes.txt"), "keep");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("dag files", () => {
  it("deletes DAG files only and keeps anything else in the folder", async () => {
    expect(await dagSizeBytes(dir)).toBe(6);
    await deleteDagFiles(dir);
    expect(await listDagFiles(dir)).toEqual([]);
    expect(existsSync(join(dir, "notes.txt"))).toBe(true);
  });

  it("lists nothing for a missing folder", async () => {
    expect(await listDagFiles(join(dir, "missing"))).toEqual([]);
  });

  it.each([
    ["a file outside the folder", join(tmpdir(), DAG)],
    ["a non-DAG name", join("DIR", "keystore")],
    ["a nested path", join("DIR", "sub", DAG)],
  ])("refuses %s", (_label, target) => {
    expect(() => assertSafeDagFile(dir, target.replace("DIR", dir))).toThrow(
      RecoveryPathError,
    );
  });

  it.each([
    ["linux", "/home/u/.ethash"],
    ["darwin", "/home/u/Library/Ethash"],
  ] as const)("resolves the %s default", (platform, expected) => {
    expect(resolveDagDir(platform, "/home/u", undefined)).toBe(expected);
  });

  it("uses LOCALAPPDATA on Windows", () => {
    expect(resolveDagDir("win32", "C:\\Users\\u", "C:\\Local")).toContain(
      "Ethash",
    );
  });
});
