import { Interface } from "ethers";
import { describe, expect, it } from "vitest";
import { TRANSFER_TOPIC, sanitizeTokenText } from "./erc20Calls";
import {
  LOG_BATCH_BLOCKS,
  MAX_TOKENS_PER_ACCOUNT,
  REORG_SAFE_DEPTH,
  ScanOutcome,
  TokenScanner,
  emptyScanState,
  type RawLog,
  type TokenScanRpc,
} from "./tokenScanner";

const ME = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NFT = "0xcccccccccccccccccccccccccccccccccccccccc";
const GENESIS = "0xgenesis";

const erc20 = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const topic = (address: string): string =>
  "0x" + address.slice(2).padStart(64, "0");

interface FakeLog extends RawLog {
  readonly block: number;
  readonly to: string;
}

/** An in-memory node: blocks are hashes by number, logs carry their block. */
function fakeNode(head: number) {
  const node = {
    head,
    hashes: new Map<number, string>(),
    logs: [] as FakeLog[],
    balances: new Map<string, bigint>(),
    reverting: new Set<string>(),
    logQueries: [] as Array<[string, number, number]>,
  };
  const hashOf = (n: number): string =>
    n === 0 ? GENESIS : (node.hashes.get(n) ?? `0xblock${n}`);
  const rpc: TokenScanRpc = {
    blockNumber: async () => node.head,
    blockHash: async (n) => hashOf(n),
    transferLogsTo: async (account, from, to) => {
      node.logQueries.push([account, from, to]);
      return node.logs.filter(
        (log) => log.to === account && log.block >= from && log.block <= to,
      );
    },
    call: async (to, data) => {
      if (node.reverting.has(to)) return null;
      const { name } = erc20.parseTransaction({ data })!;
      if (name === "balanceOf") {
        return erc20.encodeFunctionResult(name, [node.balances.get(to) ?? 0n]);
      }
      const values = { name: "Token", symbol: "TKN", decimals: 6 };
      return erc20.encodeFunctionResult(name, [
        values[name as keyof typeof values],
      ]);
    },
  };
  return { node, rpc };
}

const erc20Log = (contract: string, to: string, block: number): FakeLog => ({
  address: contract,
  topics: [TRANSFER_TOPIC, topic(OTHER), topic(to)],
  block,
  to,
});
const erc721Log = (contract: string, to: string, block: number): FakeLog => ({
  ...erc20Log(contract, to, block),
  topics: [TRANSFER_TOPIC, topic(OTHER), topic(to), topic("0x01")],
});

async function runUntilIdle(scanner: TokenScanner): Promise<void> {
  while ((await scanner.step()) === ScanOutcome.BUSY);
}

describe("TokenScanner", () => {
  it("queries Transfer logs per account and keeps only ERC-20 (3-topic) contracts", async () => {
    const { node, rpc } = fakeNode(10);
    node.logs.push(erc20Log(TOKEN_A, ME, 3), erc721Log(NFT, ME, 4));
    node.logs.push(erc20Log(TOKEN_B, OTHER, 5));
    node.balances.set(TOKEN_A, 5n).set(TOKEN_B, 5n).set(NFT, 1n);
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);

    await runUntilIdle(scanner);

    expect(node.logQueries.every(([account]) => account === ME)).toBe(true);
    expect(scanner.snapshot(ME).tokens.map((t) => t.address)).toEqual([
      TOKEN_A,
    ]);
    expect(scanner.snapshot(ME).tokens[0]).toMatchObject({
      symbol: "TKN",
      decimals: 6,
      balance: "5",
    });
  });

  it("hides tokens whose balance is zero", async () => {
    const { node, rpc } = fakeNode(10);
    node.logs.push(erc20Log(TOKEN_A, ME, 3), erc20Log(TOKEN_B, ME, 4));
    node.balances.set(TOKEN_A, 0n).set(TOKEN_B, 7n);
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);

    await runUntilIdle(scanner);

    expect(scanner.snapshot(ME).tokens.map((t) => t.address)).toEqual([
      TOKEN_B,
    ]);
  });

  it("survives a contract whose metadata and balance calls revert", async () => {
    const { node, rpc } = fakeNode(10);
    node.logs.push(erc20Log(TOKEN_A, ME, 3));
    node.reverting.add(TOKEN_A);
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);

    await runUntilIdle(scanner);

    expect(scanner.snapshot(ME).tokens).toEqual([]);
    expect(scanner.tokenMeta(TOKEN_A)).toEqual({
      name: "",
      symbol: "",
      decimals: 18,
    });
  });

  it("scans in batches and resumes from the saved cursor after a restart", async () => {
    const head = LOG_BATCH_BLOCKS * 2 + 10;
    const { node, rpc } = fakeNode(head);
    node.logs.push(erc20Log(TOKEN_A, ME, head - 1));
    node.balances.set(TOKEN_A, 1n);
    const state = emptyScanState();
    const first = new TokenScanner(rpc, state);
    first.setAccounts([ME]);

    expect(await first.step()).toBe(ScanOutcome.BUSY);
    expect(first.snapshot(ME).scan.isComplete).toBe(false);
    const restarted = new TokenScanner(rpc, JSON.parse(JSON.stringify(state)));
    restarted.setAccounts([ME]);
    await runUntilIdle(restarted);

    expect(node.logQueries.map(([, from, to]) => [from, to])).toEqual([
      [0, LOG_BATCH_BLOCKS - 1],
      [LOG_BATCH_BLOCKS, LOG_BATCH_BLOCKS * 2 - 1],
      [LOG_BATCH_BLOCKS * 2, head],
    ]);
    expect(restarted.snapshot(ME).scan.isComplete).toBe(true);
    expect(restarted.snapshot(ME).tokens).toHaveLength(1);
  });

  it("scans a newly added account from genesis while others follow the tip", async () => {
    const { node, rpc } = fakeNode(10);
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.logQueries.length = 0;

    scanner.setAccounts([ME, OTHER]);
    await runUntilIdle(scanner);

    expect(node.logQueries).toEqual([[OTHER, 0, 10]]);
  });

  it("rescans from a safe block below the old head after a reorg", async () => {
    const head = REORG_SAFE_DEPTH + 50;
    const { node, rpc } = fakeNode(head);
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.logQueries.length = 0;

    node.hashes.set(head, "0xreorged");
    await runUntilIdle(scanner);

    expect(node.logQueries).toEqual([[ME, head - REORG_SAFE_DEPTH + 1, head]]);
  });

  it("starts over when the node has a different genesis", async () => {
    const { node, rpc } = fakeNode(10);
    const state = emptyScanState();
    const scanner = new TokenScanner(rpc, state);
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.logQueries.length = 0;

    state.genesisHash = "0xother";
    await runUntilIdle(scanner);

    expect(node.logQueries).toEqual([[ME, 0, 10]]);
  });

  it(`keeps at most ${MAX_TOKENS_PER_ACCOUNT} contracts per account`, async () => {
    const { node, rpc } = fakeNode(10);
    for (let i = 0; i < MAX_TOKENS_PER_ACCOUNT + 5; i++) {
      const contract = "0x" + i.toString(16).padStart(40, "0");
      node.logs.push(erc20Log(contract, ME, 1));
      node.balances.set(contract, 1n);
    }
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);

    await runUntilIdle(scanner);

    expect(scanner.snapshot(ME).tokens).toHaveLength(MAX_TOKENS_PER_ACCOUNT);
  });
});

describe("sanitizeTokenText", () => {
  it("drops control and bidi characters and caps the length", () => {
    expect(sanitizeTokenText(" U‮SDT\u0000<b>x</b> ", 8)).toBe("USDT<b>x");
  });
});
