import { createHash } from "node:crypto";
import {
  access,
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appImageMountDir,
  envWithoutMount,
  LINUX_GETH_SHA256,
  prepareGethLaunch,
  type GethLaunchOptions,
} from "./gethBinaryCopy";
import { isOwnGethCommandLine } from "./orphanedGeth";

// Lets a test make one open() or access() fail the way a full disk or a
// noexec mount would.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), access: vi.fn(actual.access) };
});

const COMMITTED_LINUX_GETH = join("resources", "bin", "linux", "geth");
const MOUNT = "/tmp/.mount_CointMabc";
const FAKE_GETH = "#!/bin/sh\necho fake geth\n";
const FAKE_GETH_SHA256 = createHash("sha256").update(FAKE_GETH).digest("hex");
const COPY_DIR_HASH_CHARS = 16;
const POSIX_MODE_BITS = 0o777;

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code} (test)`), { code });
}

describe("LINUX_GETH_SHA256", () => {
  it("matches the committed Linux geth", async () => {
    const actual = sha256(await readFile(COMMITTED_LINUX_GETH));
    expect(
      actual,
      `${COMMITTED_LINUX_GETH} changed: set LINUX_GETH_SHA256 in gethBinaryCopy.ts ` +
        `to the output of: sha256sum ${COMMITTED_LINUX_GETH}`,
    ).toBe(LINUX_GETH_SHA256);
  });
});

describe("appImageMountDir", () => {
  const appImageEnv = { APPIMAGE: "/home/u/CointMU.AppImage", APPDIR: MOUNT };

  it("returns the mount when the resources lie inside APPDIR", () => {
    expect(appImageMountDir(appImageEnv, `${MOUNT}/resources`, "linux")).toBe(
      MOUNT,
    );
  });

  it("ignores APPIMAGE/APPDIR inherited by a .deb started from an AppImage", () => {
    expect(
      appImageMountDir(appImageEnv, "/opt/CointMU/resources", "linux"),
    ).toBeNull();
  });

  it("does not treat a sibling folder sharing the prefix as inside", () => {
    expect(
      appImageMountDir(appImageEnv, `${MOUNT}d/resources`, "linux"),
    ).toBeNull();
  });

  it.each([
    ["no APPIMAGE", { APPDIR: MOUNT }, "linux"],
    ["no APPDIR", { APPIMAGE: appImageEnv.APPIMAGE }, "linux"],
    ["not Linux", appImageEnv, "darwin"],
  ] as const)("returns null with %s", (_label, env, platform) => {
    expect(appImageMountDir(env, `${MOUNT}/resources`, platform)).toBeNull();
  });
});

describe("envWithoutMount", () => {
  it("drops the mount's folders from PATH and LD_LIBRARY_PATH only", () => {
    const env = {
      PATH: `${MOUNT}:${MOUNT}/usr/sbin:/usr/bin:/bin`,
      LD_LIBRARY_PATH: `${MOUNT}/usr/lib:/opt/lib`,
      XDG_DATA_DIRS: `${MOUNT}/usr/share`,
      HOME: "/home/u",
    };
    expect(envWithoutMount(env, MOUNT)).toEqual({
      PATH: "/usr/bin:/bin",
      LD_LIBRARY_PATH: "/opt/lib",
      XDG_DATA_DIRS: `${MOUNT}/usr/share`,
      HOME: "/home/u",
    });
  });

  it("removes a variable that only named the mount", () => {
    const result = envWithoutMount(
      { LD_LIBRARY_PATH: `${MOUNT}/usr/lib`, PATH: "/bin" },
      MOUNT,
    );
    expect(result).toEqual({ PATH: "/bin" });
  });

  it("does not change the caller's object", () => {
    const env = { PATH: `${MOUNT}:/bin` };
    envWithoutMount(env, MOUNT);
    expect(env.PATH).toBe(`${MOUNT}:/bin`);
  });
});

describe("prepareGethLaunch", () => {
  let root: string;
  let options: GethLaunchOptions;
  let copyRoot: string;
  let copyDir: string;
  let copyPath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "geth-copy-"));
    const mount = join(root, "mount");
    await mkdir(join(mount, "resources"), { recursive: true });
    const bundledPath = join(mount, "resources", "geth");
    await writeFile(bundledPath, FAKE_GETH, { mode: 0o755 });
    const userDataDir = join(root, "userData");
    options = {
      bundledPath,
      userDataDir,
      resourcesPath: join(mount, "resources"),
      env: {
        APPIMAGE: join(root, "CointMU.AppImage"),
        APPDIR: mount,
        PATH: `${mount}:/usr/bin:/bin`,
        LD_LIBRARY_PATH: `${mount}/usr/lib`,
      },
      platform: "linux",
      expectedSha256: FAKE_GETH_SHA256,
    };
    copyRoot = join(userDataDir, "geth-bin");
    copyDir = join(copyRoot, FAKE_GETH_SHA256.slice(0, COPY_DIR_HASH_CHARS));
    copyPath = join(copyDir, "geth");
    vi.mocked(open).mockClear();
    vi.mocked(access).mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  async function mode(file: string): Promise<number> {
    return (await stat(file)).mode & POSIX_MODE_BITS;
  }

  it("copies geth to userData/geth-bin/<sha256[:16]>/geth and strips the mount from env", async () => {
    const launch = await prepareGethLaunch(options);

    expect(launch.binaryPath).toBe(copyPath);
    expect(await readFile(copyPath, "utf8")).toBe(FAKE_GETH);
    expect(await mode(copyPath)).toBe(0o500);
    expect(await mode(copyDir)).toBe(0o700);
    expect(await mode(copyRoot)).toBe(0o700);
    expect(launch.env).toEqual({
      APPIMAGE: options.env.APPIMAGE,
      APPDIR: options.env.APPDIR,
      PATH: "/usr/bin:/bin",
    });
  });

  it("keeps the copy recognisable as our geth for orphan recovery (#83)", async () => {
    const { binaryPath } = await prepareGethLaunch(options);
    const dataRoot = join(options.userDataDir, "cointmu-chaindata");
    const commandLine = [
      binaryPath,
      "--networkid",
      "1912",
      "--datadir",
      join(dataRoot, "1912"),
    ].join("\0");

    expect(isOwnGethCommandLine(commandLine, dataRoot, "linux")).toBe(true);
  });

  it("copies again when the copy was changed", async () => {
    await prepareGethLaunch(options);
    await chmod(copyPath, 0o700);
    await appendFile(copyPath, "x");

    const launch = await prepareGethLaunch(options);

    expect(launch.binaryPath).toBe(copyPath);
    expect(await readFile(copyPath, "utf8")).toBe(FAKE_GETH);
    expect(await mode(copyPath)).toBe(0o500);
  });

  it("shares one copy between two concurrent calls", async () => {
    const [first, second] = await Promise.all([
      prepareGethLaunch(options),
      prepareGethLaunch(options),
    ]);

    expect(first.binaryPath).toBe(copyPath);
    expect(second.binaryPath).toBe(copyPath);
    expect(await readdir(copyDir)).toEqual(["geth"]);
    expect(vi.mocked(open)).toHaveBeenCalledTimes(1);
  });

  it("removes old copies and leftover temporary files", async () => {
    const oldDir = join(copyRoot, "0123456789abcdef");
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, "geth"), "old");
    await mkdir(copyDir, { recursive: true });
    await writeFile(join(copyDir, "geth.1.deadbeef.tmp"), "partial");

    await prepareGethLaunch(options);

    expect(await readdir(copyRoot)).toEqual([
      FAKE_GETH_SHA256.slice(0, COPY_DIR_HASH_CHARS),
    ]);
    expect(await readdir(copyDir)).toEqual(["geth"]);
  });

  it("falls back to the bundled geth when the copy does not match", async () => {
    const wrongSha256 = sha256("another geth");
    const launch = await prepareGethLaunch({
      ...options,
      expectedSha256: wrongSha256,
    });

    expect(launch).toEqual({
      binaryPath: options.bundledPath,
      env: options.env,
    });
    const dir = join(copyRoot, wrongSha256.slice(0, COPY_DIR_HASH_CHARS));
    expect(await readdir(dir)).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it.each(["ENOSPC", "EACCES"])(
    "falls back to the bundled geth when writing fails with %s",
    async (code) => {
      vi.mocked(open).mockRejectedValueOnce(errno(code));

      const launch = await prepareGethLaunch(options);

      expect(launch).toEqual({
        binaryPath: options.bundledPath,
        env: options.env,
      });
    },
  );

  it("falls back to the bundled geth when the copy cannot be executed (noexec)", async () => {
    vi.mocked(access).mockRejectedValueOnce(errno("EACCES"));

    const launch = await prepareGethLaunch(options);

    expect(launch).toEqual({
      binaryPath: options.bundledPath,
      env: options.env,
    });
  });

  it("uses the bundled geth untouched outside an AppImage", async () => {
    const env = {
      APPIMAGE: options.env.APPIMAGE,
      APPDIR: options.env.APPDIR,
      PATH: "/bin",
    };
    const launch = await prepareGethLaunch({
      ...options,
      env,
      resourcesPath: "/opt/CointMU/resources",
    });

    expect(launch).toEqual({ binaryPath: options.bundledPath, env });
    await expect(stat(copyRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
