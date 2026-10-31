export const NodeRecoveryStage = {
  RETRYING: "retrying",
  VERIFYING: "verifying",
  QUARANTINED: "quarantined",
  RESYNCING: "resyncing",
  RECOVERED: "recovered",
  BLOCKED: "blocked",
  FAILED: "failed",
  RESUMED: "resumed",
} as const;

export type NodeRecoveryStage =
  (typeof NodeRecoveryStage)[keyof typeof NodeRecoveryStage];

export const NodeBlockReason = {
  ACCESS_DENIED: "ACCESS_DENIED",
  PORT_RESERVED: "PORT_RESERVED",
  PORT_IN_USE: "PORT_IN_USE",
  DB_LOCKED: "DB_LOCKED",
} as const;

export type NodeBlockReason =
  (typeof NodeBlockReason)[keyof typeof NodeBlockReason];

/**
 * Payload of NODE_CHANNELS.RECOVERY. Carries codes only; the renderer maps
 * them to localized strings.
 */
export interface NodeRecoveryEvent {
  readonly stage: NodeRecoveryStage;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly reason?: NodeBlockReason;
  /** The port geth failed to bind, for PORT_RESERVED. */
  readonly port?: number;
  readonly backupName?: string;
  readonly needsAttention?: boolean;
  /** FAILED only: the classifier kind of the last Fatal/CRIT or corruption line. */
  readonly failureKind?: string;
  /** FAILED only: that geth line, sanitized and truncated in main. */
  readonly failureLine?: string;
}

export interface JsonRpcErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * Outcome of one node JSON-RPC call relayed by the main process: the raw
 * result, or the node's error object so callers keep the real error message.
 */
export type JsonRpcEnvelope =
  { readonly result: unknown } | { readonly error: JsonRpcErrorObject };

/** Version metadata the preload exposes as `window.systemInfo`. */
export interface AppInfo {
  readonly version: string;
  readonly codename: string;
  readonly build: string;
  /** Epoch ms when the main process started; the base for the app uptime. */
  readonly startedAtMs: number;
}

/**
 * Error reporting status for the settings card and the first-run notice.
 * `isAvailable` is false when the build has no collector configured.
 */
export interface TelemetryState {
  readonly isAvailable: boolean;
  readonly collectorHost: string | null;
  readonly isEnabled: boolean;
  readonly isNoticeAcknowledged: boolean;
}

/** One sanitized report waiting in the local queue. */
export interface QueuedReport {
  readonly id: string;
  readonly createdMs: number;
  readonly level: string;
  readonly title: string;
  /** The exact event JSON that will be sent. */
  readonly payload: string;
}

export const NodePeerHint = {
  /** The bootnode cannot be reached over TCP: off campus or no VPN. */
  BOOTNODE_UNREACHABLE: "BOOTNODE_UNREACHABLE",
  /** The bootnode answers but no peer connects: network id or enode mismatch. */
  BOOTNODE_REACHABLE_NO_PEERS: "BOOTNODE_REACHABLE_NO_PEERS",
} as const;

/** Payload of NODE_CHANNELS.PEER_HINT (null clears it); a code the renderer localizes. */
export type NodePeerHint = (typeof NodePeerHint)[keyof typeof NodePeerHint];

/** Where the bootnodes geth dials come from, highest priority first. */
export const BootnodeSource = {
  /** Saved by the user in Settings → Network. */
  USER: "user",
  /** MAIN_VITE_BOOTNODE_ENODE baked in at build time. */
  BUILD: "build",
  /** The built-in campus bootnode. */
  FALLBACK: "fallback",
} as const;

export type BootnodeSource =
  (typeof BootnodeSource)[keyof typeof BootnodeSource];

/** Payload of BOOTNODE_CHANNELS.GET, and of a successful SET or RESET. */
export interface BootnodeState {
  /** What the running node dials, or what the next start will dial. */
  readonly activeEnodes: readonly string[];
  readonly source: BootnodeSource;
  /** The saved custom list; empty when the default is used. */
  readonly customEnodes: readonly string[];
  /** True when the saved setting is not in effect until the node restarts. */
  readonly isRestartPending: boolean;
}

export const BootnodeSaveError = {
  EMPTY: "EMPTY",
  TOO_MANY: "TOO_MANY",
  INVALID_ENODE: "INVALID_ENODE",
} as const;

export type BootnodeSaveError =
  (typeof BootnodeSaveError)[keyof typeof BootnodeSaveError];

export interface InvalidBootnodeEntry {
  /** 1-based position among the non-empty entries. */
  readonly position: number;
  readonly value: string;
}

/** Payload of BOOTNODE_CHANNELS.SET. A rejected list leaves the saved one in place. */
export type BootnodeSaveResult =
  | { readonly isSaved: true; readonly state: BootnodeState }
  | {
      readonly isSaved: false;
      readonly error: BootnodeSaveError;
      readonly invalid: readonly InvalidBootnodeEntry[];
    };

/**
 * Localized text for a native file dialog, sent by the renderer because main
 * has no i18n runtime. Main validates it and keeps the file extensions itself.
 */
export interface DialogText {
  readonly title: string;
  /** Label of the single file-type filter, e.g. "JSON". */
  readonly filterName: string;
}

/**
 * Error codes main throws across `ipcMain.handle` in place of English text.
 * Electron wraps the message on the way to the renderer, so the renderer finds
 * the code anywhere in the message and localizes it.
 */
export const IpcErrorCode = {
  WALLET_CORRUPT: "WALLET_CORRUPT",
  WALLET_UNSUPPORTED_FORMAT: "WALLET_UNSUPPORTED_FORMAT",
  WALLET_INCORRECT_PASSWORD: "WALLET_INCORRECT_PASSWORD",
  MINING_NO_REWARD_ADDRESS: "MINING_NO_REWARD_ADDRESS",
} as const;

export type IpcErrorCode = (typeof IpcErrorCode)[keyof typeof IpcErrorCode];

/** Payload of the `mining:status-changed` event. */
export const MiningPowerStatus = {
  MINING: "MINING",
  PAUSED_BATTERY: "PAUSED_BATTERY",
} as const;

export type MiningPowerStatus =
  (typeof MiningPowerStatus)[keyof typeof MiningPowerStatus];

/** What a wallet activity row is; also the raw value of the CSV type column. */
export const ActivityKind = {
  SEND: "send",
  RECEIVE: "receive",
  CONTRACT_CALL: "contract_call",
  CONTRACT_DEPLOY: "contract_deploy",
  MINING_REWARD: "mining_reward",
} as const;

export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

/**
 * One wallet activity event from the main block scan. Data only: the
 * renderer builds the localized title, subtitle and age from it.
 */
export interface WalletActivity {
  readonly id: string;
  readonly kind: ActivityKind;
  /** CMU, two decimals. */
  readonly amount: string;
  /** Unix seconds of the containing block. */
  readonly timestamp: number;
  readonly blockNumber: number;
  readonly confirmations: number;
  readonly hash?: string;
  readonly from?: string;
  /** Empty for a contract deployment; the miner for a mining reward. */
  readonly to: string;
}

/** Time window of the explorer miner distribution, counted back from now. */
export const MinerRange = {
  WEEK: "week",
  MONTH: "month",
  ALL: "all",
} as const;

export type MinerRange = (typeof MinerRange)[keyof typeof MinerRange];

/** What the local explorer block index is doing. */
export const ExplorerIndexPhase = {
  /** Fetching blocks: the index does not yet reach both genesis and the node head. */
  INDEXING: "indexing",
  /** Every block from genesis to the node head is indexed; new blocks follow. */
  SYNCED: "synced",
  /** The last node call failed; the index serves what it has. */
  NODE_UNREACHABLE: "node-unreachable",
} as const;

export type ExplorerIndexPhase =
  (typeof ExplorerIndexPhase)[keyof typeof ExplorerIndexPhase];

/** Payload of EXPLORER_CHANNELS.GET_INDEX_STATUS. */
export interface ExplorerIndexStatus {
  readonly phase: ExplorerIndexPhase;
  /** Lowest and highest indexed block; the index is one contiguous range. Null when empty. */
  readonly lowestBlock: number | null;
  readonly highestBlock: number | null;
  /** The node head at the last successful call, null before the first one. */
  readonly nodeHead: number | null;
  /** Indexed share of blocks 0..nodeHead, 0-100. */
  readonly percent: number;
}

/** Blocks mined by one address in the requested range. */
export interface MinerShare {
  /** Lowercase 0x address. */
  readonly address: string;
  readonly blocks: number;
}

/** Payload of EXPLORER_CHANNELS.GET_MINER_DISTRIBUTION. */
export interface MinerDistributionResult {
  readonly range: MinerRange;
  /** The top miners, most blocks first. */
  readonly miners: readonly MinerShare[];
  /** Blocks of every miner beyond the top ones. */
  readonly otherBlocks: number;
  readonly totalBlocks: number;
  /** False while the index does not yet cover the whole range up to the node head. */
  readonly isComplete: boolean;
  readonly status: ExplorerIndexStatus;
}
