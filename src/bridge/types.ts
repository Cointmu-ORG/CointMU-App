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
  PORT_IN_USE: "PORT_IN_USE",
  DB_LOCKED: "DB_LOCKED",
  GETH_NOT_FOUND: "GETH_NOT_FOUND",
  GETH_NOT_EXECUTABLE: "GETH_NOT_EXECUTABLE",
  GETH_WRONG_ARCH: "GETH_WRONG_ARCH",
  GENESIS_INIT_FAILED: "GENESIS_INIT_FAILED",
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
  readonly backupName?: string;
  readonly needsAttention?: boolean;
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
