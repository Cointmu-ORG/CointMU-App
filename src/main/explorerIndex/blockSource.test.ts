import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  BlockSourceError,
  createHttpBlockSource,
  parseBlock,
} from "./blockSource";

const RAW_BLOCK = {
  number: "0x2a",
  hash: "0x" + "AB".repeat(32),
  parentHash: "0x" + "cd".repeat(32),
  timestamp: "0x6553f100",
  miner: "0x" + "Ef".repeat(20),
  transactions: [],
};

describe("parseBlock", () => {
  it("keeps the header fields, lowercased", () => {
    expect(parseBlock(RAW_BLOCK, 42)).toEqual({
      number: 42,
      hash: "0x" + "ab".repeat(32),
      parentHash: "0x" + "cd".repeat(32),
      timestamp: 0x6553f100,
      miner: "0x" + "ef".repeat(20),
    });
  });

  it.each([
    ["a missing block", null, 42],
    ["another height", RAW_BLOCK, 43],
    ["a short hash", { ...RAW_BLOCK, hash: "0xab" }, 42],
    ["a bad miner", { ...RAW_BLOCK, miner: "miner" }, 42],
    ["a decimal timestamp", { ...RAW_BLOCK, timestamp: 1700000000 }, 42],
  ])("rejects %s", (_, raw, expected) => {
    expect(() => parseBlock(raw, expected)).toThrow(BlockSourceError);
  });
});

describe("createHttpBlockSource", () => {
  let server: Server | null = null;

  afterEach(() => {
    server?.close();
    server = null;
  });

  /** Starts a fake node that answers each JSON-RPC batch with `reply(request)`. */
  async function fakeNode(
    reply: (request: { id: number; params: unknown[] }) => unknown,
    shouldReverse = false,
  ): Promise<number> {
    const node = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const replies = (
          JSON.parse(body) as { id: number; params: unknown[] }[]
        ).map(reply);
        res.end(JSON.stringify(shouldReverse ? replies.reverse() : replies));
      });
    });
    server = node;
    await new Promise<void>((resolve) => node.listen(0, "127.0.0.1", resolve));
    return (node.address() as AddressInfo).port;
  }

  it("matches batch replies to requests by id", async () => {
    const port = await fakeNode(
      ({ id, params }) => ({
        jsonrpc: "2.0",
        id,
        result: { ...RAW_BLOCK, number: params[0] },
      }),
      true,
    );

    const blocks = await createHttpBlockSource(() => port).blocks(
      [7, 8, 9],
      new AbortController().signal,
    );

    expect(blocks.map((block) => block.number)).toEqual([7, 8, 9]);
  });

  it("fails the whole batch on one error entry", async () => {
    const port = await fakeNode(({ id }) =>
      id === 1
        ? {
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message: "header not found" },
          }
        : { jsonrpc: "2.0", id, result: RAW_BLOCK },
    );

    await expect(
      createHttpBlockSource(() => port).blocks(
        [42, 42],
        new AbortController().signal,
      ),
    ).rejects.toThrow(BlockSourceError);
  });
});
