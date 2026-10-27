import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FALLBACK_BUILD_ID, readAppInfo } from "./system";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({ app: {}, ipcMain: {} }));

describe("readAppInfo", () => {
  let appRoot: string;

  beforeEach(async () => {
    appRoot = await mkdtemp(join(tmpdir(), "cointmu-app-info-"));
    await writeFile(
      join(appRoot, "package.json"),
      JSON.stringify({ version: "1.6.17", codename: "Siren" }),
    );
  });

  afterEach(async () => {
    await rm(appRoot, { recursive: true, force: true });
  });

  it("reads version, codename and build id", async () => {
    await writeFile(
      join(appRoot, "build-info.json"),
      JSON.stringify({ build: "6dc5db9b" }),
    );

    expect(readAppInfo(appRoot)).toEqual({
      version: "1.6.17",
      codename: "Siren",
      build: "6dc5db9b",
    });
  });

  it("falls back when build-info.json is missing", () => {
    expect(readAppInfo(appRoot).build).toBe(FALLBACK_BUILD_ID);
  });

  it("falls back when build-info.json has no build id", async () => {
    await writeFile(join(appRoot, "build-info.json"), "{}");

    expect(readAppInfo(appRoot).build).toBe(FALLBACK_BUILD_ID);
  });
});
