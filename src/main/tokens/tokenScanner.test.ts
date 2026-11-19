import { Interface } from "ethers";
import { describe, expect, it } from "vitest";
import { TRANSFER_TOPIC, sanitizeTokenText } from "./erc20Calls";
import { TRANSFER_BATCH_TOPIC, TRANSFER_SINGLE_TOPIC } from "./erc1155";
import { MAX_NFTS_PER_ACCOUNT, MAX_NFTS_PER_CONTRACT } from "./nftOwnership";
import {
  FULL_REFRESH_INTERVAL_BLOCKS,
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
const MULTI = "0xdddddddddddddddddddddddddddddddddddddddd";
const GENESIS = "0xgenesis";

const erc20 = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
]);
const erc1155 = new Interface([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "function balanceOf(address, uint256) view returns (uint256)",
]);
const ERC1155_BALANCE_OF = erc1155.getFunction("balanceOf")?.selector ?? "";
const isErc1155Log = (log: RawLog): boolean =>
  log.topics[0] === TRANSFER_SINGLE_TOPIC ||
  log.topics[0] === TRANSFER_BATCH_TOPIC;
const topic = (address: string): string =>
  "0x" + address.slice(2).padStart(64, "0");

interface FakeLog extends RawLog {
  readonly block: number;
  readonly from: string;
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
    balanceCalls: [] as string[],
    /** NFT owners by "contract:tokenId". */
    owners: new Map<string, string>(),
    ownerCalls: [] as string[],
    /** ERC-1155 balances by "contract:tokenId". */
    multiBalances: new Map<string, bigint>(),
    multiBalanceCalls: [] as string[],
  };
  const inRange = (log: FakeLog, from: number, to: number): boolean =>
    log.block >= from && log.block <= to;
  const hashOf = (n: number): string =>
    n === 0 ? GENESIS : (node.hashes.get(n) ?? `0xblock${n}`);
  const rpc: TokenScanRpc = {
    blockNumber: async () => node.head,
    blockHash: async (n) => hashOf(n),
    transferLogsTo: async (account, from, to) => {
      node.logQueries.push([account, from, to]);
      return node.logs.filter(
        (log) =>
          !isErc1155Log(log) && log.to === account && inRange(log, from, to),
      );
    },
    transferLogsFrom: async (account, from, to) =>
      node.logs.filter(
        (log) =>
          !isErc1155Log(log) && log.from === account && inRange(log, from, to),
      ),
    erc1155LogsTo: async (account, from, to) =>
      node.logs.filter(
        (log) =>
          isErc1155Log(log) && log.to === account && inRange(log, from, to),
      ),
    erc1155LogsFrom: async (account, from, to) =>
      node.logs.filter(
        (log) =>
          isErc1155Log(log) && log.from === account && inRange(log, from, to),
      ),
    call: async (to, data) => {
      if (node.reverting.has(to)) return null;
      if (data.startsWith(ERC1155_BALANCE_OF)) {
        const [, id] = erc1155.decodeFunctionData("balanceOf", data);
        const key = `${to}:${id}`;
        node.multiBalanceCalls.push(key);
        return erc1155.encodeFunctionResult("balanceOf", [
          node.multiBalances.get(key) ?? 0n,
        ]);
      }
      const { name, args } = erc20.parseTransaction({ data })!;
      if (name === "ownerOf") {
        const key = `${to}:${args[0]}`;
        node.ownerCalls.push(key);
        const owner = node.owners.get(key);
        return owner === undefined
          ? null
          : erc20.encodeFunctionResult(name, [owner]);
      }
      if (name === "balanceOf") {
        node.balanceCalls.push(to);
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

const erc20Log = (
  contract: string,
  to: string,
  block: number,
  from = OTHER,
): FakeLog => ({
  address: contract,
  topics: [TRANSFER_TOPIC, topic(from), topic(to)],
  block,
  from,
  to,
});
const erc721Log = (
  contract: string,
  to: string,
  block: number,
  from = OTHER,
  tokenId = 1,
): FakeLog => ({
  ...erc20Log(contract, to, block, from),
  topics: [
    TRANSFER_TOPIC,
    topic(from),
    topic(to),
    topic("0x" + tokenId.toString(16)),
  ],
});

function multiLog(
  event: "TransferSingle" | "TransferBatch",
  values: readonly unknown[],
  { to = ME, from = OTHER, block = 3 } = {},
): FakeLog {
  const { topics, data } = erc1155.encodeEventLog(event, [
    OTHER,
    from,
    to,
    ...values,
  ]);
  return { address: MULTI, topics, data, block, from, to };
}

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

describe("TokenScanner balance refresh", () => {
  async function followingScanner() {
    const { node, rpc } = fakeNode(10);
    node.logs.push(erc20Log(TOKEN_A, ME, 3), erc20Log(TOKEN_B, ME, 4));
    node.balances.set(TOKEN_A, 5n).set(TOKEN_B, 7n);
    const state = emptyScanState();
    const scanner = new TokenScanner(rpc, state);
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.balanceCalls.length = 0;
    return { node, rpc, state, scanner };
  }

  it("reads no balance on a new head without Transfer logs for the account", async () => {
    const { node, scanner } = await followingScanner();

    node.head = 11;
    node.logs.push(erc20Log(TOKEN_A, OTHER, 11, TOKEN_B));
    await runUntilIdle(scanner);

    expect(node.balanceCalls).toEqual([]);
  });

  it("re-reads only the contracts in the new block's inbound and outbound logs", async () => {
    const { node, scanner } = await followingScanner();

    node.head = 12;
    node.logs.push(erc20Log(TOKEN_B, OTHER, 12, ME));
    node.balances.set(TOKEN_B, 2n);
    await runUntilIdle(scanner);

    expect(node.balanceCalls).toEqual([TOKEN_B]);
    expect(scanner.snapshot(ME).tokens.map((t) => t.balance)).toEqual([
      "5",
      "2",
    ]);
  });

  it(`reads every balance after ${FULL_REFRESH_INTERVAL_BLOCKS} blocks`, async () => {
    const { node, scanner } = await followingScanner();

    node.head = 10 + FULL_REFRESH_INTERVAL_BLOCKS - 1;
    await runUntilIdle(scanner);
    expect(node.balanceCalls).toEqual([]);
    node.head += 1;
    await runUntilIdle(scanner);

    expect(node.balanceCalls.sort()).toEqual([TOKEN_A, TOKEN_B]);
  });

  it("reads every balance after a reorg and on restart", async () => {
    const { node, rpc, state, scanner } = await followingScanner();

    node.hashes.set(10, "0xreorged");
    await runUntilIdle(scanner);
    expect(node.balanceCalls.sort()).toEqual([TOKEN_A, TOKEN_B]);
    node.balanceCalls.length = 0;
    const restarted = new TokenScanner(rpc, state);
    await runUntilIdle(restarted);

    expect(node.balanceCalls.sort()).toEqual([TOKEN_A, TOKEN_B]);
  });
});

describe("TokenScanner NFTs", () => {
  async function scannerOwningNft() {
    const { node, rpc } = fakeNode(10);
    node.logs.push(erc721Log(NFT, ME, 3));
    node.owners.set(`${NFT}:1`, ME);
    const state = emptyScanState();
    const scanner = new TokenScanner(rpc, state);
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.ownerCalls.length = 0;
    return { node, rpc, state, scanner };
  }

  it("records 4-topic Transfer logs as owned NFTs once ownerOf confirms", async () => {
    const { node, scanner } = await scannerOwningNft();

    expect(scanner.nftSnapshot(ME).nfts).toEqual([
      { contract: NFT, tokenId: "1" },
    ]);
    expect(scanner.snapshot(ME).tokens).toEqual([]);
    expect(node.ownerCalls).toEqual([]);
  });

  it("drops an NFT the account transferred out, checking only that token", async () => {
    const { node, scanner } = await scannerOwningNft();

    node.head = 11;
    node.logs.push(erc721Log(NFT, OTHER, 11, ME));
    node.owners.set(`${NFT}:1`, OTHER);
    await runUntilIdle(scanner);

    expect(node.ownerCalls).toEqual([`${NFT}:1`]);
    expect(scanner.nftSnapshot(ME).nfts).toEqual([]);
  });

  it("forgets an NFT whose inbound transfer a reorg removed", async () => {
    const { node, scanner } = await scannerOwningNft();
    node.head = 11;
    node.logs.push(erc721Log(NFT, ME, 11, OTHER, 2));
    node.owners.set(`${NFT}:2`, ME);
    await runUntilIdle(scanner);
    expect(scanner.nftSnapshot(ME).nfts).toHaveLength(2);

    node.hashes.set(11, "0xreorged");
    node.logs.pop();
    node.owners.set(`${NFT}:2`, OTHER);
    await runUntilIdle(scanner);

    expect(scanner.nftSnapshot(ME).nfts).toEqual([
      { contract: NFT, tokenId: "1" },
    ]);
  });

  it("rescans from genesis when the saved state predates NFT tracking", async () => {
    const { node, rpc, state } = await scannerOwningNft();
    delete state.accounts[ME].nfts;
    node.logQueries.length = 0;

    const restarted = new TokenScanner(rpc, state);
    await runUntilIdle(restarted);

    expect(node.logQueries).toEqual([[ME, 0, 10]]);
    expect(restarted.nftSnapshot(ME).nfts).toHaveLength(1);
  });

  it(`keeps at most ${MAX_NFTS_PER_ACCOUNT} NFTs and never drops owned ones for a new contract`, async () => {
    const { node, rpc } = fakeNode(10);
    const contractOf = (id: number): string =>
      "0x" +
      Math.floor(id / MAX_NFTS_PER_CONTRACT)
        .toString(16)
        .padStart(40, "0");
    for (let id = 0; id < MAX_NFTS_PER_ACCOUNT + 5; id++) {
      node.logs.push(erc721Log(contractOf(id), ME, 1, OTHER, id));
      node.owners.set(`${contractOf(id)}:${id}`, ME);
    }
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    const owned = scanner.nftSnapshot(ME).nfts;

    node.head = 11;
    node.logs.push(erc721Log(NFT, ME, 11));
    node.owners.set(`${NFT}:1`, ME);
    await runUntilIdle(scanner);

    expect(owned).toHaveLength(MAX_NFTS_PER_ACCOUNT);
    expect(scanner.nftSnapshot(ME).nfts).toEqual(owned);
  });

  it(`keeps at most ${MAX_NFTS_PER_CONTRACT} NFTs of one contract`, async () => {
    const { node, rpc } = fakeNode(10);
    for (let id = 0; id < MAX_NFTS_PER_CONTRACT + 5; id++) {
      node.logs.push(erc721Log(NFT, ME, 1, OTHER, id));
      node.owners.set(`${NFT}:${id}`, ME);
    }
    const scanner = new TokenScanner(rpc, emptyScanState());
    scanner.setAccounts([ME]);

    await runUntilIdle(scanner);

    expect(scanner.nftSnapshot(ME).nfts).toHaveLength(MAX_NFTS_PER_CONTRACT);
  });
});

describe("sanitizeTokenText", () => {
  it("drops control and bidi characters and caps the length", () => {
    expect(sanitizeTokenText(" U‮SDT\u0000<b>x</b> ", 8)).toBe("USDT<b>x");
  });
});

describe("TokenScanner ERC-1155", () => {
  async function scannerHolding(...logs: FakeLog[]) {
    const { node, rpc } = fakeNode(10);
    node.logs.push(...logs);
    node.multiBalances.set(`${MULTI}:7`, 3n);
    const state = emptyScanState();
    const scanner = new TokenScanner(rpc, state);
    scanner.setAccounts([ME]);
    await runUntilIdle(scanner);
    node.multiBalanceCalls.length = 0;
    return { node, rpc, state, scanner };
  }

  it("records a TransferSingle to the account once balanceOf confirms it", async () => {
    const { scanner } = await scannerHolding(
      multiLog("TransferSingle", [7n, 3n]),
    );

    expect(scanner.nftSnapshot(ME).nfts).toEqual([
      { contract: MULTI, tokenId: "7" },
    ]);
    expect(scanner.snapshot(ME).tokens).toEqual([]);
  });

  it("decodes every id of a TransferBatch and keeps only the held ones", async () => {
    const { scanner } = await scannerHolding(
      multiLog("TransferBatch", [
        [7n, 8n],
        [3n, 1n],
      ]),
    );

    expect(scanner.nftSnapshot(ME).nfts).toEqual([
      { contract: MULTI, tokenId: "7" },
    ]);
  });

  it("drops a token sent away to a zero balance, checking only that id", async () => {
    const { node, scanner } = await scannerHolding(
      multiLog("TransferSingle", [7n, 3n]),
    );

    node.head = 11;
    node.logs.push(
      multiLog("TransferBatch", [[7n], [3n]], {
        from: ME,
        to: OTHER,
        block: 11,
      }),
    );
    node.multiBalances.set(`${MULTI}:7`, 0n);
    await runUntilIdle(scanner);

    expect(node.multiBalanceCalls).toEqual([`${MULTI}:7`]);
    expect(scanner.nftSnapshot(ME).nfts).toEqual([]);
  });

  it("re-reads held balances on a full refresh, not with ownerOf", async () => {
    const { node, scanner } = await scannerHolding(
      multiLog("TransferSingle", [7n, 3n]),
    );

    node.head = 10 + FULL_REFRESH_INTERVAL_BLOCKS;
    await runUntilIdle(scanner);

    expect(node.multiBalanceCalls).toEqual([`${MULTI}:7`]);
    expect(node.ownerCalls).toEqual([]);
  });

  it("rescans from genesis when the saved state predates ERC-1155 tracking", async () => {
    const { node, rpc, state } = await scannerHolding(
      multiLog("TransferSingle", [7n, 3n]),
    );
    delete state.accounts[ME].erc1155;
    node.logQueries.length = 0;

    const restarted = new TokenScanner(rpc, state);
    await runUntilIdle(restarted);

    expect(node.logQueries).toEqual([[ME, 0, 10]]);
    expect(restarted.nftSnapshot(ME).nfts).toHaveLength(1);
  });

  it("tracks a real NFT received after a huge held TransferBatch", async () => {
    const spamIds = Array.from({ length: MAX_NFTS_PER_ACCOUNT + 100 }, (_, i) =>
      BigInt(i),
    );
    const { node, scanner } = await scannerHolding(
      multiLog("TransferBatch", [spamIds, spamIds.map(() => 1n)]),
    );
    for (const id of spamIds) node.multiBalances.set(`${MULTI}:${id}`, 1n);
    node.head = 10 + FULL_REFRESH_INTERVAL_BLOCKS;
    await runUntilIdle(scanner);
    expect(scanner.nftSnapshot(ME).nfts).toHaveLength(MAX_NFTS_PER_CONTRACT);

    node.head += 1;
    node.logs.push(erc721Log(NFT, ME, node.head));
    node.owners.set(`${NFT}:1`, ME);
    await runUntilIdle(scanner);

    expect(scanner.nftSnapshot(ME).nfts).toContainEqual({
      contract: NFT,
      tokenId: "1",
    });
  });

  it("skips a log whose data does not decode", async () => {
    const broken = { ...multiLog("TransferSingle", [7n, 3n]), data: "0x01" };
    const { scanner } = await scannerHolding(broken);

    expect(scanner.nftSnapshot(ME).nfts).toEqual([]);
  });
});
