// Config
export { FOUND_BLOCKS_PAGE_SIZE } from "./config/mining.constants";

// Lib (Hooks & Utils)
export { useMiningStats } from "./lib/mining-stats.hook";
export { useMiningControls } from "./lib/mining-controls.hook";
export { useMiningActivity } from "./lib/mining-activity.hook";
export { useMiningLogStream } from "./lib/mining-log-stream.hook";
export { useSyncStatus } from "./lib/sync-status.hook";
export { usePeerHintKey } from "./lib/peer-hint.hook";
export {
  getSafeConcurrency,
  formatRewards,
  formatDifficultyLabel,
} from "./lib/mining.utils";
export * from "./lib/miner-distribution.util";

// Model
export { useMiningStore } from "./model/mining.store";
export type { FoundBlock } from "./model/mining.store";
export type { SyncStatus, SyncStatusKind } from "./model/sync-status.types";

// UI
export { MiningHeader } from "./ui/mining-header.component";
export { MiningHeroCard } from "./ui/mining-hero-card.component";
export { MiningStatsGrid } from "./ui/mining-stats-grid.component";
export { WorkerConfiguration } from "./ui/worker-configuration.component";
export {
  MiningActivity,
  ACTIVITY_TAB_FOUND,
} from "./ui/mining-activity.component";
export { MiningIcon } from "./ui/mining-icon.component";
export { NodeRecoveryBanner } from "./ui/node-recovery-banner.component";

// API (Services)
export * from "./api/mining.service";
export { MiningCacheService } from "./api/mining-cache.service";
export type { ActivityContribution } from "./api/activity.service";
