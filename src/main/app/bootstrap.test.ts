import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronApp = vi.hoisted(() => ({ isPackaged: false, appPath: "" }));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return electronApp.isPackaged;
    },
    getAppPath: () => electronApp.appPath,
  },
}));
vi.mock("../diagnostics/logging", () => ({ initLogging: vi.fn() }));
vi.mock("../diagnostics/errorReporting", () => ({
  initErrorReporting: vi.fn(),
}));

const KEPT = "COINTMU_TEST_FROM_ENV";
const LOADED = "COINTMU_TEST_FROM_FILE";

async function runBootstrap(): Promise<void> {
  vi.resetModules();
  await import("./bootstrap");
}

describe("bootstrap .env loading", () => {
  beforeEach(() => {
    electronApp.appPath = mkdtempSync(join(tmpdir(), "cointmu-env-"));
    writeFileSync(
      join(electronApp.appPath, ".env"),
      `${KEPT}=from-file\n${LOADED}=from-file\n`,
    );
  });

  afterEach(() => {
    rmSync(electronApp.appPath, { recursive: true, force: true });
    delete process.env[KEPT];
    delete process.env[LOADED];
  });

  it("loads .env in dev but keeps values already in the environment", async () => {
    electronApp.isPackaged = false;
    process.env[KEPT] = "from-env";

    await runBootstrap();

    expect(process.env[KEPT]).toBe("from-env");
    expect(process.env[LOADED]).toBe("from-file");
  });

  it("does not load .env in a packaged app", async () => {
    electronApp.isPackaged = true;

    await runBootstrap();

    expect(process.env[LOADED]).toBeUndefined();
  });

  it("starts without a .env in dev", async () => {
    electronApp.isPackaged = false;
    rmSync(join(electronApp.appPath, ".env"));

    await expect(runBootstrap()).resolves.toBeUndefined();
  });
});
