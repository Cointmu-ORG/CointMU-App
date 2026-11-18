import type { DetectedTokens } from "../../bridge/types";
import {
  ERC20_TRANSFER_TOPIC_COUNT,
  readTokenBalance,
  readTokenMeta,
  type EthCall,
  type TokenMeta,
} from "./erc20Calls";

/** Blocks per eth_getLogs query, as the NFT discovery uses. */
export const LOG_BATCH_BLOCKS = 5_000;
/** Detected contracts kept per account; spam beyond this is ignored. */
export const MAX_TOKENS_PER_ACCOUNT = 200;
/** After a reorg or chain reset, rescan from this many blocks below the last known head. */
export const REORG_SAFE_DEPTH = 128;
/**
 * Every this many blocks all balances are read again, for tokens whose
 * balance changes without a Transfer log (rebasing, non-standard mint/burn).
 */
export const FULL_REFRESH_INTERVAL_BLOCKS = 100;
const NOT_STARTED = -1;

/** Whether a step did work (step again soon) or found nothing to do. */
export const ScanOutcome = { BUSY: "busy", IDLE: "idle" } as const;
export type ScanOutcome = (typeof ScanOutcome)[keyof typeof ScanOutcome];

/** One eth_getLogs entry, as the node returns it. */
export interface RawLog {
  readonly address: string;
  readonly topics: readonly string[];
}

/** What the scanner reads from the node; every method rejects on a node error. */
export interface TokenScanRpc {
  blockNumber(): Promise<number>;
  /** @returns The hash of a block at or below the head. */
  blockHash(blockNumber: number): Promise<string>;
  /** Transfer logs whose recipient (topic2) is the account, inclusive range. */
  transferLogsTo(account: string, from: number, to: number): Promise<RawLog[]>;
  /** Transfer logs whose sender (topic1) is the account, inclusive range. */
  transferLogsFrom(
    account: string,
    from: number,
    to: number,
  ): Promise<RawLog[]>;
  call: EthCall;
}

/** Per-account scan progress and findings. Addresses are lowercase. */
export interface AccountScan {
  /** Highest block scanned; -1 before the first batch. */
  cursor: number;
  contracts: string[];
  /** Raw balances (decimal strings) by contract. */
  balances: Record<string, string>;
  /** Head of the last full balance refresh; -1 forces one. */
  balancesAt: number;
  /** Contracts with a Transfer to or from the account since balances were last read. */
  touched?: string[];
}

/** Persisted scanner state, one per network. */
export interface TokenScanState {
  genesisHash: string | null;
  head: { number: number; hash: string } | null;
  accounts: Record<string, AccountScan>;
  meta: Record<string, TokenMeta>;
}

export const emptyScanState = (): TokenScanState => ({
  genesisHash: null,
  head: null,
  accounts: {},
  meta: {},
});

const newAccountScan = (): AccountScan => ({
  cursor: NOT_STARTED,
  contracts: [],
  balances: {},
  balancesAt: NOT_STARTED,
  touched: [],
});

/**
 * @param logs - Transfer logs to one account.
 * @returns The lowercase contracts of the ERC-20 logs; ERC-721 logs (4 topics) are skipped.
 */
export function erc20Contracts(logs: readonly RawLog[]): string[] {
  return logs
    .filter((log) => log.topics.length === ERC20_TRANSFER_TOPIC_COUNT)
    .map((log) => log.address.toLowerCase());
}

/**
 * Finds the ERC-20 tokens each wallet account has ever received by scanning
 * Transfer logs to it, from genesis in LOG_BATCH_BLOCKS batches and then
 * following new blocks. Progress lives in the state, so a restart resumes.
 * A reorg or chain reset moves cursors back REORG_SAFE_DEPTH blocks below the
 * last known head; a new genesis starts over. All balances are read once
 * the account is caught up (startup, new account, reorg) and every
 * FULL_REFRESH_INTERVAL_BLOCKS; in between, a new head re-reads only the
 * contracts with a Transfer to or from the account in the new blocks.
 */
export class TokenScanner {
  private headBlock: number | null = null;
  private readonly scanStartedMs = new Map<string, number>();

  constructor(
    private readonly rpc: TokenScanRpc,
    private readonly state: TokenScanState,
  ) {
    // Balances may have moved while the app was closed.
    for (const scan of Object.values(state.accounts)) {
      scan.balancesAt = NOT_STARTED;
    }
  }

  /** Adds new accounts (scanned from genesis) and drops removed ones. */
  setAccounts(addresses: readonly string[]): void {
    const wanted = new Set(addresses.map((a) => a.toLowerCase()));
    for (const known of Object.keys(this.state.accounts)) {
      if (!wanted.has(known)) delete this.state.accounts[known];
    }
    for (const address of wanted) {
      this.state.accounts[address] ??= newAccountScan();
    }
  }

  /** One scan step; the service loop calls it repeatedly. */
  async step(): Promise<ScanOutcome> {
    const head = await this.rpc.blockNumber();
    const genesis = await this.rpc.blockHash(0);
    if (this.state.genesisHash !== genesis) this.reset(genesis);
    else await this.rewindOnReorg(head);
    this.headBlock = head;

    let isBusy = false;
    for (const [account, scan] of Object.entries(this.state.accounts)) {
      if (scan.cursor < head) await this.scanBatch(account, scan, head);
      if (scan.cursor < head) isBusy = true;
      else await this.refreshBalances(account, scan, head);
    }
    this.state.head = { number: head, hash: await this.rpc.blockHash(head) };
    return isBusy ? ScanOutcome.BUSY : ScanOutcome.IDLE;
  }

  /**
   * @param account - A wallet account.
   * @returns Its tokens with a balance above zero, and its scan progress.
   */
  snapshot(account: string): DetectedTokens {
    const scan = this.state.accounts[account.toLowerCase()];
    const head = this.headBlock;
    const progress = {
      scannedBlock: Math.max(0, scan?.cursor ?? 0),
      headBlock: head,
      isComplete: scan !== undefined && head !== null && scan.cursor >= head,
    };
    if (scan === undefined) return { tokens: [], scan: progress };
    const tokens = scan.contracts.flatMap((address) => {
      const meta = this.state.meta[address];
      const balance = scan.balances[address] ?? "0";
      return meta && BigInt(balance) > 0n
        ? [{ address, ...meta, balance }]
        : [];
    });
    return { tokens, scan: progress };
  }

  /** @returns The metadata of a detected contract, if any account received it. */
  tokenMeta(contract: string): TokenMeta | undefined {
    return this.state.meta[contract.toLowerCase()];
  }

  private reset(genesis: string): void {
    console.warn("[tokens] New genesis; scanning every account from the start");
    this.state.genesisHash = genesis;
    this.state.head = null;
    this.state.meta = {};
    for (const account of Object.keys(this.state.accounts)) {
      this.state.accounts[account] = newAccountScan();
    }
  }

  private async rewindOnReorg(head: number): Promise<void> {
    const known = this.state.head;
    if (known === null) return;
    if (
      known.number <= head &&
      (await this.rpc.blockHash(known.number)) === known.hash
    ) {
      return;
    }
    const safe = Math.max(
      NOT_STARTED,
      Math.min(known.number, head) - REORG_SAFE_DEPTH,
    );
    console.warn(
      `[tokens] Reorg or chain reset; rescanning from block ${safe + 1}`,
    );
    for (const scan of Object.values(this.state.accounts)) {
      scan.cursor = Math.min(scan.cursor, safe);
      scan.balancesAt = NOT_STARTED;
    }
    this.state.head = null;
  }

  private async scanBatch(
    account: string,
    scan: AccountScan,
    head: number,
  ): Promise<void> {
    if (scan.cursor === NOT_STARTED)
      this.scanStartedMs.set(account, Date.now());
    const from = scan.cursor + 1;
    const to = Math.min(scan.cursor + LOG_BATCH_BLOCKS, head);
    const logs = await this.rpc.transferLogsTo(account, from, to);
    const inbound = erc20Contracts(logs);
    for (const contract of inbound) {
      if (scan.contracts.length >= MAX_TOKENS_PER_ACCOUNT) break;
      if (!scan.contracts.includes(contract)) scan.contracts.push(contract);
    }
    // A pending full refresh reads every balance anyway; skip the outbound query.
    if (scan.balancesAt !== NOT_STARTED) {
      const outbound = erc20Contracts(
        await this.rpc.transferLogsFrom(account, from, to),
      );
      const touched = new Set([
        ...(scan.touched ?? []),
        ...inbound,
        ...outbound,
      ]);
      scan.touched = [...touched].filter((c) => scan.contracts.includes(c));
    }
    scan.cursor = to;
    const startedMs = this.scanStartedMs.get(account);
    if (to === head && startedMs !== undefined) {
      this.scanStartedMs.delete(account);
      console.log(
        `[tokens] Initial scan of ${head + 1} blocks took ${Date.now() - startedMs} ms (${scan.contracts.length} contracts)`,
      );
    }
  }

  /** Reads all balances when a full refresh is due, else only the touched ones. */
  private async refreshBalances(
    account: string,
    scan: AccountScan,
    head: number,
  ): Promise<void> {
    const isFull =
      scan.balancesAt === NOT_STARTED ||
      head - scan.balancesAt >= FULL_REFRESH_INTERVAL_BLOCKS;
    const contracts = isFull ? scan.contracts : (scan.touched ?? []);
    for (const contract of contracts) {
      this.state.meta[contract] ??= await readTokenMeta(
        this.rpc.call,
        contract,
      );
    }
    const balances = await Promise.all(
      contracts.map((contract) =>
        readTokenBalance(this.rpc.call, contract, account),
      ),
    );
    const read = Object.fromEntries(
      contracts.map((contract, i) => [contract, balances[i]]),
    );
    scan.balances = isFull ? read : { ...scan.balances, ...read };
    scan.touched = [];
    if (isFull) scan.balancesAt = head;
  }
}
