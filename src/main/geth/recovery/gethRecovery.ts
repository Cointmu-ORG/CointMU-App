import { setTimeout as delay } from "node:timers/promises";
import ms from "ms";
import {
  NodeBlockReason,
  NodeRecoveryStage,
  type NodeRecoveryEvent,
} from "../../../bridge/types";
import {
  GethErrorKind,
  GethLineSeverity,
  classifyGethLine,
  extractListenPort,
  isCorruptionConfirmed,
  type GethLineClassification,
} from "./gethErrorClassifier";
import { quarantineChainData } from "./chaindataQuarantine";
import { sanitizeLocalLine } from "../../diagnostics/localSanitizer";
import { callGethRpc } from "../../utils/rpcUtils";

const RESTART_BACKOFF_MS = [ms("3s"), ms("10s"), ms("30s")];
const HEALTH_GRACE_MS = ms("15s");
const RPC_HEALTH_TIMEOUT_MS = ms("5s");
const MAX_RECOVERIES_PER_SESSION = 1;
const UNKNOWN_FATAL_MAX_RESTARTS = 5;
const UNKNOWN_FATAL_WINDOW_MS = ms("10m");
const MAX_FAILURE_LINE_CHARS = 300;

const RecoveryPhase = {
  IDLE: "idle",
  RECOVERING: "recovering",
  BLOCKED: "blocked",
  FAILED: "failed",
} as const;

type RecoveryPhase = (typeof RecoveryPhase)[keyof typeof RecoveryPhase];

export interface GethRecoveryDeps {
  readonly spawnGeth: () => Promise<void>;
  /** Stops geth and resolves once its exit event has fired. */
  readonly stopGeth: () => Promise<void>;
  readonly hasGethExited: () => boolean;
  readonly initGenesis: (dataDir: string) => Promise<void>;
  readonly resolveDataDir: () => string;
  /** The HTTP-RPC port, or null when RPC is disabled. */
  readonly resolveRpcPort: () => number | null;
  readonly broadcast: (event: NodeRecoveryEvent) => void;
}

interface PendingErrorCorruption {
  readonly classification: GethLineClassification;
  readonly atMs: number;
}

/**
 * Owns geth failure handling: classifies log lines, blocks restarts on port or
 * lock conflicts, caps restarts on unknown fatals, and runs the staged chaindata
 * recovery (retry with backoff, then quarantine and resync) for confirmed corruption.
 */
export class GethRecovery {
  private phase: RecoveryPhase = RecoveryPhase.IDLE;
  private lastEvent: NodeRecoveryEvent | null = null;
  private pendingErrorCorruption: PendingErrorCorruption | null = null;
  private isAttemptCorrupted = false;
  private hasPendingUnknownFatal = false;
  private quarantineCount = 0;
  private unknownFatalTimestamps: number[] = [];
  private lastFailure: { kind: GethErrorKind; line: string } | null = null;

  constructor(private readonly deps: GethRecoveryDeps) {}

  /** @returns True while automatic restarts must not run. */
  isRestartSuppressed(): boolean {
    return this.phase !== RecoveryPhase.IDLE;
  }

  /** @returns The latest event while not idle, so a late window can catch up. */
  getActiveEvent(): NodeRecoveryEvent | null {
    return this.phase === RecoveryPhase.IDLE ? null : this.lastEvent;
  }

  /**
   * Feeds one complete geth log line through the classifier.
   * @param line - A single geth log line.
   */
  handleLogLine(line: string): void {
    const classification = classifyGethLine(line);
    if (!classification) return;
    if (
      classification.severity === GethLineSeverity.FATAL ||
      classification.kind === GethErrorKind.DB_CORRUPT
    ) {
      this.lastFailure = { kind: classification.kind, line };
    }

    if (classification.kind === GethErrorKind.DB_CORRUPT) {
      this.handleCorruptLine(classification);
      return;
    }
    if (classification.severity !== GethLineSeverity.FATAL) return;
    if (classification.kind === GethErrorKind.UNKNOWN_FATAL) {
      // Geth echoes Fatal lines to stdout and stderr; count once at exit.
      this.hasPendingUnknownFatal = true;
      return;
    }
    this.block(classification.kind, extractListenPort(line));
  }

  /**
   * Settles what the last run logged once geth exits unexpectedly: counts an
   * unknown fatal toward the restart cap and confirms pending ERROR corruption.
   */
  handleUnexpectedExit(): void {
    if (this.hasPendingUnknownFatal) {
      this.hasPendingUnknownFatal = false;
      this.countUnknownFatal();
    }
    const pending = this.pendingErrorCorruption;
    this.pendingErrorCorruption = null;
    if (
      pending &&
      isCorruptionConfirmed(pending.classification, Date.now() - pending.atMs)
    ) {
      this.confirmCorruption();
    }
  }

  /**
   * Clears a blocked/failed state after a user action (retry, settings restart).
   * @returns False while a recovery is running, so the caller must not restart.
   */
  resume(): boolean {
    if (this.phase === RecoveryPhase.RECOVERING) return false;
    this.phase = RecoveryPhase.IDLE;
    this.unknownFatalTimestamps = [];
    this.hasPendingUnknownFatal = false;
    this.pendingErrorCorruption = null;
    this.lastFailure = null;
    this.emit({ stage: NodeRecoveryStage.RESUMED });
    return true;
  }

  private handleCorruptLine(classification: GethLineClassification): void {
    if (isCorruptionConfirmed(classification, null)) {
      this.confirmCorruption();
      return;
    }
    console.warn(
      "[geth:recovery] ERROR-level corruption logged; waiting to see if geth exits",
    );
    this.pendingErrorCorruption = { classification, atMs: Date.now() };
  }

  private confirmCorruption(): void {
    if (this.phase === RecoveryPhase.RECOVERING) {
      this.isAttemptCorrupted = true;
      return;
    }
    if (this.phase === RecoveryPhase.IDLE) void this.runRecovery();
  }

  private countUnknownFatal(): void {
    if (this.phase !== RecoveryPhase.IDLE) return;
    const now = Date.now();
    this.unknownFatalTimestamps = [
      ...this.unknownFatalTimestamps.filter(
        (at) => now - at < UNKNOWN_FATAL_WINDOW_MS,
      ),
      now,
    ];
    if (this.unknownFatalTimestamps.length > UNKNOWN_FATAL_MAX_RESTARTS)
      this.fail();
  }

  private block(reason: NodeBlockReason, port: number | null = null): void {
    if (this.phase === RecoveryPhase.FAILED) return;
    if (this.phase === RecoveryPhase.BLOCKED) return;
    this.phase = RecoveryPhase.BLOCKED;
    this.emit({
      stage: NodeRecoveryStage.BLOCKED,
      reason,
      ...(reason === NodeBlockReason.PORT_RESERVED && port !== null
        ? { port }
        : {}),
    });
  }

  private fail(): void {
    this.phase = RecoveryPhase.FAILED;
    const failure = this.lastFailure;
    this.emit({
      stage: NodeRecoveryStage.FAILED,
      needsAttention: true,
      ...(failure && {
        failureKind: failure.kind,
        failureLine: sanitizeLocalLine(failure.line, MAX_FAILURE_LINE_CHARS),
      }),
    });
  }

  private emit(event: NodeRecoveryEvent): void {
    this.lastEvent = event;
    this.deps.broadcast(event);
  }

  private isRecovering(): boolean {
    return this.phase === RecoveryPhase.RECOVERING;
  }

  private async runRecovery(): Promise<void> {
    this.phase = RecoveryPhase.RECOVERING;
    console.warn(
      "[geth:recovery] Corruption confirmed; starting staged recovery",
    );
    try {
      if (await this.retryWithBackoff()) return this.markRecovered();
      if (!this.isRecovering()) return;
      if (this.quarantineCount >= MAX_RECOVERIES_PER_SESSION)
        return this.fail();
      if (await this.quarantineAndResync()) return this.markRecovered();
      if (this.isRecovering()) this.fail();
    } catch (err) {
      console.error("[geth:recovery] Recovery aborted:", err);
      this.fail();
    }
  }

  private markRecovered(): void {
    this.phase = RecoveryPhase.IDLE;
    this.emit({ stage: NodeRecoveryStage.RECOVERED });
  }

  private async retryWithBackoff(): Promise<boolean> {
    for (const [index, backoffMs] of RESTART_BACKOFF_MS.entries()) {
      this.emit({
        stage: NodeRecoveryStage.RETRYING,
        attempt: index + 1,
        maxAttempts: RESTART_BACKOFF_MS.length,
      });
      await this.deps.stopGeth();
      await delay(backoffMs);
      if (await this.restartAndVerify()) return true;
      if (!this.isRecovering()) return false;
    }
    return false;
  }

  /**
   * Spawns geth and checks health after the grace period: the process must be
   * alive, no corruption may be confirmed meanwhile (an ERROR line alone does
   * not count), and eth_blockNumber must answer within RPC_HEALTH_TIMEOUT_MS.
   */
  private async restartAndVerify(): Promise<boolean> {
    this.isAttemptCorrupted = false;
    this.pendingErrorCorruption = null;
    await this.deps.spawnGeth();
    this.emit({ stage: NodeRecoveryStage.VERIFYING });
    await delay(HEALTH_GRACE_MS);

    if (this.isAttemptCorrupted || this.deps.hasGethExited()) return false;
    const rpcPort = this.deps.resolveRpcPort();
    if (rpcPort === null) return true;
    const blockNumber = await callGethRpc(
      rpcPort,
      "eth_blockNumber",
      [],
      RPC_HEALTH_TIMEOUT_MS,
    );
    return blockNumber !== null;
  }

  private async quarantineAndResync(): Promise<boolean> {
    this.quarantineCount++;
    await this.deps.stopGeth();
    if (!this.deps.hasGethExited()) {
      throw new Error(
        "geth exit was not observed; refusing to quarantine chaindata",
      );
    }

    const dataDir = this.deps.resolveDataDir();
    const backupName = await quarantineChainData(dataDir);
    if (backupName) {
      this.emit({ stage: NodeRecoveryStage.QUARANTINED, backupName });
    }

    this.emit({ stage: NodeRecoveryStage.RESYNCING });
    await this.deps.initGenesis(dataDir);
    return this.restartAndVerify();
  }
}
