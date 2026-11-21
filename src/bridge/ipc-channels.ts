export const NODE_CHANNELS = {
  RECOVERY: "node:recovery",
  RETRY: "node:retry",
  GET_RECOVERY_STATE: "node:get-recovery-state",
  PEER_HINT: "node:peer-hint",
  GET_PEER_HINT: "node:get-peer-hint",
  SYNC_STALL: "node:sync-stall",
  GET_SYNC_STALL: "node:get-sync-stall",
  STOP_WAIT: "node:stop-wait",
  GET_STOP_WAIT: "node:get-stop-wait",
} as const;

export const BOOTNODE_CHANNELS = {
  GET: "bootnode:get",
  SET: "bootnode:set",
  RESET: "bootnode:reset",
  PROBE: "bootnode:probe",
} as const;

export const RPC_CHANNELS = {
  CALL: "rpc:call",
} as const;

export const SYSTEM_CHANNELS = {
  GET_APP_INFO: "system:get-app-info",
} as const;

export const DIAGNOSTICS_CHANNELS = {
  OPEN_LOGS_FOLDER: "diagnostics:open-logs-folder",
  COPY_RECENT_LOGS: "diagnostics:copy-recent-logs",
  GET_TELEMETRY_STATE: "diagnostics:get-telemetry-state",
  SET_TELEMETRY_ENABLED: "diagnostics:set-telemetry-enabled",
  ACKNOWLEDGE_NOTICE: "diagnostics:acknowledge-notice",
  LIST_QUEUED_REPORTS: "diagnostics:list-queued-reports",
  CLEAR_QUEUED_REPORTS: "diagnostics:clear-queued-reports",
  EXPORT_BUNDLE: "diagnostics:export-bundle",
} as const;

export const EXPLORER_CHANNELS = {
  GET_MINER_DISTRIBUTION: "explorer:get-miner-distribution",
  GET_INDEX_STATUS: "explorer:get-index-status",
  REBUILD_INDEX: "explorer:rebuild-index",
} as const;

export const SHELL_CHANNELS = {
  SET_TEXT: "shell:set-text",
  GET_CAPABILITIES: "shell:get-capabilities",
} as const;

export const CHAINDATA_CHANNELS = {
  GET_INFO: "chaindata:get-info",
  PICK_TARGET: "chaindata:pick-target",
  MOVE: "chaindata:move",
  DELETE_OLD: "chaindata:delete-old",
  PROGRESS: "chaindata:progress",
  GET_RESYNC_INFO: "chaindata:get-resync-info",
  RESYNC: "chaindata:resync",
  DELETE_BACKUP: "chaindata:delete-backup",
} as const;

export const CLIPBOARD_CHANNELS = {
  COPY_SENSITIVE: "clipboard:copy-sensitive",
} as const;

export const TOKEN_CHANNELS = {
  GET_DETECTED: "tokens:get-detected",
  GET_DETECTED_NFTS: "tokens:get-detected-nfts",
  FETCH_NFT_MEDIA: "tokens:fetch-nft-media",
  CHANGED: "tokens:changed",
} as const;

export const ASSET_LOGO_CHANNELS = {
  GET_ALL: "asset-logos:get-all",
  SET: "asset-logos:set",
  RESET: "asset-logos:reset",
} as const;

export const MAINTENANCE_CHANNELS = {
  CLEAR_CACHE: "maintenance:clear-cache",
  GET_DAG_INFO: "maintenance:get-dag-info",
  DELETE_DAG: "maintenance:delete-dag",
} as const;
