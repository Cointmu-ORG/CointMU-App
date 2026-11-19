import { useCallback, useState } from "react";
import type { ChainResyncError, ChainResyncInfo } from "@bridge/types";
import {
  deleteChainBackup,
  getResyncInfo,
  resyncChain,
} from "../api/chain-resync.service";

export type ChainResyncStep =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm" }
  | { readonly kind: "running" }
  | { readonly kind: "done" }
  | { readonly kind: "failed"; readonly error: ChainResyncError | "FAILED" };

export interface ChainResyncState {
  readonly info: ChainResyncInfo | null;
  readonly step: ChainResyncStep;
  readonly isDeletingBackup: boolean;
  readonly hasBackupDeleteFailed: boolean;
  /** Measures the sizes again; the hook does not measure on mount. */
  readonly refresh: () => Promise<void>;
  readonly open: () => void;
  readonly close: () => void;
  readonly confirm: () => Promise<void>;
  readonly deleteBackup: () => Promise<void>;
}

const IDLE: ChainResyncStep = { kind: "idle" };

/**
 * Drives "Resync from scratch" and "Delete backup": loads the sizes on open, walks
 * the confirm → running → result steps, and refreshes the sizes after each.
 * @returns The state and its actions.
 */
export function useChainResync(): ChainResyncState {
  const [info, setInfo] = useState<ChainResyncInfo | null>(null);
  const [step, setStep] = useState<ChainResyncStep>(IDLE);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);
  const [hasBackupDeleteFailed, setHasBackupDeleteFailed] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setInfo(await getResyncInfo());
    } catch (err) {
      console.error("[resync] Failed to read the chain data size", err);
    }
  }, []);

  const open = useCallback((): void => {
    setStep({ kind: "confirm" });
    void refresh();
  }, [refresh]);

  const confirm = useCallback(async (): Promise<void> => {
    setStep({ kind: "running" });
    try {
      const result = await resyncChain();
      setStep(
        result.ok ? { kind: "done" } : { kind: "failed", error: result.error },
      );
    } catch (err) {
      console.error("[resync] Resync failed", err);
      setStep({ kind: "failed", error: "FAILED" });
    }
    await refresh();
  }, [refresh]);

  const deleteBackup = useCallback(async (): Promise<void> => {
    setIsDeletingBackup(true);
    setHasBackupDeleteFailed(false);
    try {
      await deleteChainBackup();
    } catch (err) {
      console.error("[resync] Failed to delete the backup", err);
      setHasBackupDeleteFailed(true);
    }
    setIsDeletingBackup(false);
    await refresh();
  }, [refresh]);

  return {
    info,
    step,
    isDeletingBackup,
    hasBackupDeleteFailed,
    refresh,
    open,
    close: () => setStep(IDLE),
    confirm,
    deleteBackup,
  };
}
