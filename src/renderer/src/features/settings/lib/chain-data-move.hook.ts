import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChainDataMovePhase,
  type ChainDataInfo,
  type ChainDataMoveError,
} from "@bridge/types";

/** Where the move flow is. */
export type ChainDataMoveStep =
  | { readonly kind: "idle" }
  | {
      readonly kind: "confirm";
      readonly target: string;
      readonly requiredBytes: number;
    }
  | { readonly kind: "moving"; readonly phase: ChainDataMovePhase }
  | {
      readonly kind: "moved";
      readonly oldRoot: string;
      readonly oldSizeBytes: number;
    };

/** A move error code, or UNKNOWN for a failed IPC call. */
export type ChainDataMoveProblem = ChainDataMoveError | "UNKNOWN";

export interface ChainDataMoveState {
  readonly info: ChainDataInfo | null;
  readonly step: ChainDataMoveStep;
  readonly problem: ChainDataMoveProblem | null;
  readonly pickTarget: () => Promise<void>;
  readonly startMove: () => Promise<void>;
  readonly deleteOld: () => Promise<void>;
  readonly close: () => void;
}

const IDLE: ChainDataMoveStep = { kind: "idle" };

/**
 * Drives Settings → General → Chain data: shows where the data is, lets the
 * user pick a new folder (checked in main), runs the move, then offers to
 * delete the old copy.
 * @returns The state and actions.
 */
export function useChainDataMove(): ChainDataMoveState {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ChainDataInfo | null>(null);
  const [step, setStep] = useState<ChainDataMoveStep>(IDLE);
  const [problem, setProblem] = useState<ChainDataMoveProblem | null>(null);

  const refresh = useCallback(
    (): Promise<void> =>
      window.api.chainData
        .getInfo()
        .then(setInfo)
        .catch((err: unknown) => {
          console.error("Failed to read the chain data location", err);
        }),
    [],
  );

  useEffect(() => {
    void refresh();
    return window.api.chainData.onProgress(({ phase }) =>
      setStep({ kind: "moving", phase }),
    );
  }, [refresh]);

  const pickTarget = async (): Promise<void> => {
    setProblem(null);
    try {
      const picked = await window.api.chainData.pickTarget({
        title: t("settings:general.chainDataPickTitle"),
        filterName: "",
      });
      if (!picked) return;
      if ("error" in picked) setProblem(picked.error);
      else setStep({ kind: "confirm", ...picked, target: picked.path });
    } catch (err) {
      console.error("Failed to pick a chain data folder", err);
      setProblem("UNKNOWN");
    }
  };

  const startMove = async (): Promise<void> => {
    if (step.kind !== "confirm") return;
    const oldSizeBytes = info?.sizeBytes ?? 0;
    setStep({ kind: "moving", phase: ChainDataMovePhase.STOPPING });
    try {
      const result = await window.api.chainData.move(step.target);
      if (result.ok) {
        setStep({ kind: "moved", oldRoot: result.oldRoot, oldSizeBytes });
      } else {
        setStep(IDLE);
        setProblem(result.error);
      }
    } catch (err) {
      console.error("Failed to move the chain data", err);
      setStep(IDLE);
      setProblem("UNKNOWN");
    }
    await refresh();
  };

  const deleteOld = async (): Promise<void> => {
    try {
      await window.api.chainData.deleteOld();
    } catch (err) {
      console.error("Failed to delete the old chain data", err);
      setProblem("UNKNOWN");
    }
    setStep(IDLE);
  };

  return {
    info,
    step,
    problem,
    pickTarget,
    startMove,
    deleteOld,
    close: () => setStep(IDLE),
  };
}
