import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callGethIpc,
  parseResponseLine,
  splitJsonLines,
} from "./gethIpcClient";

const REQUEST_ID = 7;
const SHORT_TIMEOUT_MS = 200;
const TEST_TIMEOUT_MS = 2_000;

describe("splitJsonLines", () => {
  it("keeps an unfinished line for the next chunk", () => {
    expect(splitJsonLines('{"id":1}\n{"id":')).toEqual({
      lines: ['{"id":1}'],
      rest: '{"id":',
    });
  });

  it("drops blank lines", () => {
    expect(splitJsonLines('\n\n{"id":1}\n').lines).toEqual(['{"id":1}']);
  });
});

describe("parseResponseLine", () => {
  it("returns the result for the matching id", () => {
    expect(parseResponseLine('{"id":7,"result":"0x1"}', REQUEST_ID)).toEqual({
      result: "0x1",
    });
  });

  it("keeps the node's error object", () => {
    expect(
      parseResponseLine(
        '{"id":7,"error":{"code":-32000,"message":"boom","data":"0x"}}',
        REQUEST_ID,
      ),
    ).toEqual({ error: { code: -32000, message: "boom", data: "0x" } });
  });

  it("ignores a response for another id", () => {
    expect(parseResponseLine('{"id":8,"result":1}', REQUEST_ID)).toBeNull();
  });

  it("reports malformed JSON", () => {
    expect(parseResponseLine("{oops", REQUEST_ID)).toHaveProperty("error");
  });
});

describe.skipIf(process.platform === "win32")("callGethIpc", () => {
  let dir: string;
  let socketPath: string;
  let server: Server | null = null;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cointmu-ipc-client-"));
    socketPath = join(dir, "geth.ipc");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = null;
    await rm(dir, { recursive: true, force: true });
  });

  function listen(
    onRequest: (line: string, reply: (s: string) => void) => void,
  ): Promise<void> {
    const created = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (line: string) =>
        onRequest(line, (s) => socket.write(s)),
      );
    });
    server = created;
    return new Promise<void>((resolve) => created.listen(socketPath, resolve));
  }

  it(
    "round-trips a request split across chunks",
    async () => {
      await listen((line, reply) => {
        const { id, method } = JSON.parse(line);
        const body = JSON.stringify({ jsonrpc: "2.0", id, result: method });
        reply(body.slice(0, 5));
        setTimeout(() => reply(body.slice(5) + "\n"), 10);
      });
      await expect(
        callGethIpc(socketPath, "miner_start", [1], TEST_TIMEOUT_MS),
      ).resolves.toEqual({ result: "miner_start" });
    },
    TEST_TIMEOUT_MS,
  );

  it("returns an error envelope when nothing listens", async () => {
    const envelope = await callGethIpc(
      join(dir, "missing.ipc"),
      "miner_stop",
      [],
      TEST_TIMEOUT_MS,
    );
    expect(envelope).toHaveProperty("error.message");
  });

  it(
    "times out when the node never answers",
    async () => {
      await listen(() => {});
      const envelope = await callGethIpc(
        socketPath,
        "miner_stop",
        [],
        SHORT_TIMEOUT_MS,
      );
      expect(envelope).toEqual({
        error: { code: -32603, message: "geth IPC miner_stop timed out" },
      });
    },
    TEST_TIMEOUT_MS,
  );
});
