import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awaitOrphanInterruptible, orphanIpcPath } from "./orphanReadiness";

const SHORT_WAIT_MS = 400;
const POLL_MS = 50;
const MARGIN_MS = 100;

describe("orphanIpcPath", () => {
  it("reads --ipcpath from a NUL-separated Linux cmdline", () => {
    const line = [
      "/x/geth",
      "--ipcpath",
      "/run/a b/geth.ipc",
      "--port",
      "1",
      "",
    ].join("\0");
    expect(orphanIpcPath(line, "linux")).toBe("/run/a b/geth.ipc");
  });

  it("reads a macOS path with spaces up to the next flag", () => {
    const line =
      "/Apps/geth --datadir /x --ipcpath /Users/u/Library/Application Support/CointMU/g.ipc --port 30303";
    expect(orphanIpcPath(line, "darwin")).toBe(
      "/Users/u/Library/Application Support/CointMU/g.ipc",
    );
  });

  it("reads --ipcpath as the last macOS argument", () => {
    expect(orphanIpcPath("/x/geth --ipcpath /tmp/g.ipc", "darwin")).toBe(
      "/tmp/g.ipc",
    );
  });

  it.each([
    ["linux", ["/x/geth", "--ipcdisable", ""].join("\0")],
    ["darwin", "/x/geth --ipcdisable --port 1"],
    ["linux", ["/x/geth", "--ipcpath"].join("\0")],
  ] as const)("is null without an IPC path (%s)", (platform, line) => {
    expect(orphanIpcPath(line, platform)).toBeNull();
  });
});

describe("awaitOrphanInterruptible", () => {
  let dir: string;
  let server: Server | null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cointmu-orphan-ipc-"));
    server = null;
  });

  afterEach(async () => {
    server?.close();
    await rm(dir, { recursive: true, force: true });
  });

  /** A fake geth IPC endpoint answering every request. */
  function listen(path: string): Promise<void> {
    server = createServer((socket) => {
      socket.on("data", (chunk) => {
        const { id } = JSON.parse(String(chunk));
        socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, result: {} })}\n`);
      });
    });
    return new Promise((resolve) => server?.listen(path, resolve));
  }

  const options = (path: string, isAlive = (): boolean => true) => ({
    ipcPath: path,
    isAlive,
    waitMs: SHORT_WAIT_MS * 10,
    pollMs: POLL_MS,
    marginMs: MARGIN_MS,
  });

  it("resolves only after IPC answers, plus the margin", async () => {
    const path = join(dir, "geth.ipc");
    const startedAt = Date.now();
    setTimeout(() => void listen(path), SHORT_WAIT_MS);

    await awaitOrphanInterruptible(options(path));

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
      SHORT_WAIT_MS + MARGIN_MS,
    );
  });

  it("gives up after the wait cap", async () => {
    const startedAt = Date.now();

    await awaitOrphanInterruptible({
      ...options(join(dir, "never.ipc")),
      waitMs: SHORT_WAIT_MS,
    });

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(SHORT_WAIT_MS);
    expect(elapsedMs).toBeLessThan(SHORT_WAIT_MS * 10);
  });

  it("stops waiting once the orphan has exited", async () => {
    const startedAt = Date.now();

    await awaitOrphanInterruptible(
      options(join(dir, "never.ipc"), () => false),
    );

    expect(Date.now() - startedAt).toBeLessThan(SHORT_WAIT_MS);
  });
});
