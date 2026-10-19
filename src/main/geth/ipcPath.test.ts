import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUnixSocketPath,
  buildWindowsPipePath,
  isUnixSocketPathWithinLimit,
  planIpcEndpoint,
} from "./ipcPath";

const INSTALL_ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const LINUX_USER_DATA = join("/home", "user", ".config", "CointMU");
const LINUX_LIMIT_BYTES = 107;
const MAC_LIMIT_BYTES = 103;

/** Builds a userData dir whose socket path is exactly `bytes` long. */
function userDataForSocketLength(bytes: number): string {
  const suffix = buildUnixSocketPath(join("x", "ipc")).length - "x".length;
  return "/" + "a".repeat(bytes - suffix - 1);
}

describe("buildWindowsPipePath", () => {
  it("names the pipe after the install id", () => {
    expect(buildWindowsPipePath(INSTALL_ID)).toBe(
      `\\\\.\\pipe\\cointmu-geth-${INSTALL_ID}`,
    );
  });

  it.each(["", "not-a-uuid", "..\\..\\evil", INSTALL_ID.toUpperCase()])(
    "rejects install id %j",
    (installId) => {
      expect(() => buildWindowsPipePath(installId)).toThrow();
    },
  );
});

describe("isUnixSocketPathWithinLimit", () => {
  it.each([
    ["linux", LINUX_LIMIT_BYTES],
    ["darwin", MAC_LIMIT_BYTES],
  ] as const)("accepts exactly the %s limit", (platform, limit) => {
    const path = "/" + "a".repeat(limit - 1);
    expect(isUnixSocketPathWithinLimit(path, platform)).toBe(true);
    expect(isUnixSocketPathWithinLimit(path + "a", platform)).toBe(false);
  });

  it("counts bytes, not characters", () => {
    const multiByte = "/" + "é".repeat(60);
    expect(multiByte.length).toBeLessThan(MAC_LIMIT_BYTES);
    expect(isUnixSocketPathWithinLimit(multiByte, "darwin")).toBe(false);
  });
});

describe("planIpcEndpoint", () => {
  it("uses a named pipe on Windows", () => {
    expect(
      planIpcEndpoint({
        platform: "win32",
        userDataDir: "C:\\Users\\u\\AppData\\Roaming\\CointMU",
        installId: INSTALL_ID,
      }),
    ).toEqual({ kind: "pipe", path: buildWindowsPipePath(INSTALL_ID) });
  });

  it("puts the socket in the userData ipc dir when it fits", () => {
    const dir = join(LINUX_USER_DATA, "ipc");
    expect(
      planIpcEndpoint({
        platform: "linux",
        userDataDir: LINUX_USER_DATA,
        installId: INSTALL_ID,
      }),
    ).toEqual({ kind: "unix", dir, path: join(dir, "geth.ipc") });
  });

  it("asks for a short private dir when userData is too long", () => {
    const userDataDir = userDataForSocketLength(MAC_LIMIT_BYTES + 1);
    expect(
      planIpcEndpoint({
        platform: "darwin",
        userDataDir,
        installId: INSTALL_ID,
      }).kind,
    ).toBe("unix-too-long");
  });

  it("keeps a userData path that is exactly at the limit", () => {
    const userDataDir = userDataForSocketLength(MAC_LIMIT_BYTES);
    expect(
      planIpcEndpoint({
        platform: "darwin",
        userDataDir,
        installId: INSTALL_ID,
      }).kind,
    ).toBe("unix");
  });
});
