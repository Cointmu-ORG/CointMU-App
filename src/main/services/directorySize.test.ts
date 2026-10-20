import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDirectorySize } from "./directorySize";

describe("getDirectorySize", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cointmu-dir-size-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("sums file sizes across nested directories", async () => {
    await mkdir(join(root, "geth", "chaindata"), { recursive: true });
    await writeFile(join(root, "a.log"), "abc");
    await writeFile(join(root, "geth", "chaindata", "000001.ldb"), "12345");

    await expect(getDirectorySize(root)).resolves.toBe(8);
  });

  it("returns 0 for an empty directory", async () => {
    await expect(getDirectorySize(root)).resolves.toBe(0);
  });

  it("returns 0 when the directory does not exist", async () => {
    await expect(getDirectorySize(join(root, "missing"))).resolves.toBe(0);
  });
});
