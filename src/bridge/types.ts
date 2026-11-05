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
  /** The user added nodes or turned defaults off in Settings → Network. */
  USER: "user",
  /** MAIN_VITE_BOOTNODE_ENODE baked in at build time. */
  BUILD: "build",
  /** The built-in campus bootnodes. */
  FALLBACK: "fallback",
} as const;

export type BootnodeSource =
  (typeof BootnodeSource)[keyof typeof BootnodeSource];

/** A node the user added in Settings → Network. */
export interface CustomBootnode {
  readonly enode: string;
  /** Shown instead of "Node N"; "" when the user gave none. */
  readonly label: string;
}

/** The stored node setting, and the payload of BOOTNODE_CHANNELS.SET. */
export interface BootnodeSettings {
  readonly custom: readonly CustomBootnode[];
  /** Default enodes the user turned off. */
  readonly disabled: readonly string[];
}

/** One row of the node list: a default or custom node. */
export interface BootnodeEntry {
  readonly enode: string;
  readonly label: string;
  /** Hostname or IP from the enode. */
  readonly host: string;
  readonly isDefault: boolean;
  readonly isEnabled: boolean;
}

/** Payload of BOOTNODE_CHANNELS.GET, and of a successful SET or RESET. */
export interface BootnodeState {
  /** Default nodes first, then the custom ones. */
  readonly nodes: readonly BootnodeEntry[];
  /** Where the default nodes come from, or USER when the list was changed. */
  readonly source: BootnodeSource;
  /** True when a removed node stays a bootnode of the running node until it restarts. */
  readonly isRestartPending: boolean;
}

/** Payload of BOOTNODE_CHANNELS.PROBE: one entry per probed node. */
export interface BootnodeStatus {
  readonly enode: string;
  /** TCP connect time to host:port, or null when it did not answer in time. */
  readonly latencyMs: number | null;
  /** Whether the local node is peered with it; null while the local node is stopped. */
  readonly isPeer: boolean | null;
  readonly checkedAtMs: number;
}

export const BootnodeSaveError = {
  /** No node would stay enabled. */
  EMPTY: "EMPTY",
  TOO_MANY: "TOO_MANY",
  INVALID_ENODE: "INVALID_ENODE",
  /** The node id is already in the list. */
  DUPLICATE: "DUPLICATE",
  INVALID_LABEL: "INVALID_LABEL",
} as const;

export type BootnodeSaveError =
  (typeof BootnodeSaveError)[keyof typeof BootnodeSaveError];

export interface InvalidBootnodeEntry {
  /** 1-based position among the non-empty entries. */
  readonly position: number;
  readonly value: string;
}

/** Payload of BOOTNODE_CHANNELS.SET. A rejected setting leaves the saved one in place. */
export type BootnodeSaveResult =
  | { readonly isSaved: true; readonly state: BootnodeState }
  | { readonly isSaved: false; readonly error: BootnodeSaveError };

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

/**
 * Payload of the `mining:status-changed` event: what the mining policy
 * decided for mining the user switched on, or STOPPED while it is off.
 */
export const MiningPowerStatus = {
  MINING: "MINING",
  PAUSED_BATTERY: "PAUSED_BATTERY",
  PAUSED_USER_ACTIVE: "PAUSED_USER_ACTIVE",
  PAUSED_SCHEDULE: "PAUSED_SCHEDULE",
  STOPPED: "STOPPED",
} as const;

export type MiningPowerStatus =
  (typeof MiningPowerStatus)[keyof typeof MiningPowerStatus];

/** Where "Start mining at launch" is in this session. */
export const MiningAutoStartPhase = {
  /** Waiting for the node and the settings to allow mining. */
  WAITING: "waiting",
  /** Mining starts at startsAt unless cancelled or a condition is lost. */
  COUNTDOWN: "countdown",
  /** Started, cancelled, taken over by the user, or off: not again this session. */
  DONE: "done",
} as const;

export type MiningAutoStartPhase =
  (typeof MiningAutoStartPhase)[keyof typeof MiningAutoStartPhase];

/** Payload of the `mining:auto-start` event. */
export interface MiningAutoStartState {
  readonly phase: MiningAutoStartPhase;
  /** Epoch ms when mining starts; set only while counting down. */
  readonly startsAt: number | null;
}

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

/**
 * Localized strings the main process shows outside the renderer: the tray
 * menu and its status lines, and the quit confirmation dialog. The renderer sends them on every language
 * change; `{{name}}` placeholders are filled in main.
 */
export interface ShellText {
  readonly trayOpen: string;
  readonly trayStartMining: string;
  readonly trayStopMining: string;
  readonly trayQuit: string;
  /** `{{percent}}` */
  readonly traySyncing: string;
  readonly traySynced: string;
  readonly trayOffline: string;
  readonly trayMining: string;
  readonly trayNotMining: string;
  /** `{{count}}` */
  readonly trayPeers: string;
  readonly quitConfirmTitle: string;
  readonly quitConfirmMessage: string;
  readonly quitConfirmDetail: string;
  readonly quitConfirmQuit: string;
  readonly quitConfirmCancel: string;
  readonly quitConfirmNeverAsk: string;
  /** `{{seconds}}`; the desktop notification before mining starts at launch. */
  readonly autoStartTitle: string;
  readonly autoStartBody: string;
  readonly autoStartCancel: string;
}

/** What the desktop shell supports on this OS and desktop environment. */
export interface ShellCapabilities {
  /** False on macOS (dock convention) and on Linux desktops without a tray host. */
  readonly isTraySupported: boolean;
}

/** Why moving the chain data did not happen; the renderer localizes it. */
export const ChainDataMoveError = {
  SAME_FOLDER: "SAME_FOLDER",
  INSIDE_CURRENT: "INSIDE_CURRENT",
  NOT_EMPTY: "NOT_EMPTY",
  NOT_WRITABLE: "NOT_WRITABLE",
  NOT_ENOUGH_SPACE: "NOT_ENOUGH_SPACE",
  COPY_FAILED: "COPY_FAILED",
  VERIFY_FAILED: "VERIFY_FAILED",
  BUSY: "BUSY",
} as const;

export type ChainDataMoveError =
  (typeof ChainDataMoveError)[keyof typeof ChainDataMoveError];

/** Where the chain data lives and how big it is. */
export interface ChainDataInfo {
  readonly root: string;
  readonly sizeBytes: number;
  readonly isDefault: boolean;
}

/** A folder the user picked for the move, already checked, or why it cannot be used. */
export type ChainDataTarget =
  | { readonly path: string; readonly requiredBytes: number }
  | { readonly path: string; readonly error: ChainDataMoveError };

export type ChainDataMoveResult =
  | { readonly ok: true; readonly oldRoot: string }
  | { readonly ok: false; readonly error: ChainDataMoveError };

/** Steps of a move, sent while it runs. */
export const ChainDataMovePhase = {
  STOPPING: "stopping",
  COPYING: "copying",
  VERIFYING: "verifying",
  STARTING: "starting",
} as const;

export type ChainDataMovePhase =
  (typeof ChainDataMovePhase)[keyof typeof ChainDataMovePhase];

export interface ChainDataMoveProgress {
  readonly phase: ChainDataMovePhase;
  /** Copy progress 0-100 while copying. */
  readonly percent?: number;
}
