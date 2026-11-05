export const NODE_CHANNELS = {
  RECOVERY: "node:recovery",
  RETRY: "node:retry",
  GET_RECOVERY_STATE: "node:get-recovery-state",
  PEER_HINT: "node:peer-hint",
  GET_PEER_HINT: "node:get-peer-hint",
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
} as const;

export const EXPLORER_CHANNELS = {
  GET_MINER_DISTRIBUTION: "explorer:get-miner-distribution",
  GET_INDEX_STATUS: "explorer:get-index-status",
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
} as const;
