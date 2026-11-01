import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IpcEndpointError,
  createShortPrivateDir,
  ensurePrivateDir,
  getOrCreateInstallId,
} from "./ipcEndpoint";

const PERMISSION_BITS = 0o777;
const PRIVATE_MODE = 0o700;
const WORLD_READABLE_MODE = 0o755;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode & PERMISSION_BITS;
}

describe.skipIf(process.platform === "win32")("ensurePrivateDir", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cointmu-ipc-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates a missing directory with mode 0700", async () => {
    const dir = join(root, "userData", "ipc");
    await ensurePrivateDir(dir);
    expect(await modeOf(dir)).toBe(PRIVATE_MODE);
  });

  it("tightens an existing world-readable directory", async () => {
    const dir = join(root, "ipc");
    await mkdir(dir);
    await chmod(dir, WORLD_READABLE_MODE);
    await ensurePrivateDir(dir);
    expect(await modeOf(dir)).toBe(PRIVATE_MODE);
  });

  it("refuses a symlink", async () => {
    const target = join(root, "elsewhere");
    const link = join(root, "ipc");
    await mkdir(target);
    await symlink(target, link);
    await expect(ensurePrivateDir(link)).rejects.toThrow(IpcEndpointError);
  });
});

describe.skipIf(process.platform === "win32")("createShortPrivateDir", () => {
  it("creates a fresh 0700 directory", async () => {
    const dir = await createShortPrivateDir();
    try {
      expect(await modeOf(dir)).toBe(PRIVATE_MODE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("getOrCreateInstallId", () => {
  function memoryStore(initial: Record<string, unknown> = {}) {
    const data = { ...initial };
    return {
      data,
      get: (key: string) => data[key],
      set: (key: string, value: unknown) => {
        data[key] = value;
      },
    };
  }

  it("creates and persists a UUID on first use", () => {
    const store = memoryStore();
    const id = getOrCreateInstallId(store);
    expect(id).toMatch(UUID_PATTERN);
    expect(getOrCreateInstallId(store)).toBe(id);
  });

  it("reuses a stored id", () => {
    const store = memoryStore({ "geth.ipcInstallId": "existing-id" });
    expect(getOrCreateInstallId(store)).toBe("existing-id");
  });
});
