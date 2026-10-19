export const NODE_CHANNELS = {
  RECOVERY: "node:recovery",
  RETRY: "node:retry",
  GET_RECOVERY_STATE: "node:get-recovery-state",
} as const;

export const RPC_CHANNELS = {
  CALL: "rpc:call",
} as const;
