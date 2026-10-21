export const NODE_CHANNELS = {
  RECOVERY: "node:recovery",
  RETRY: "node:retry",
  GET_RECOVERY_STATE: "node:get-recovery-state",
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
