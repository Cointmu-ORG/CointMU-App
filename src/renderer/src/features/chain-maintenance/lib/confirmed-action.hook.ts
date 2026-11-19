import { useCallback, useState } from "react";

export type ConfirmedActionStatus =
  "idle" | "confirm" | "busy" | "done" | "failed";

export interface ConfirmedAction {
  readonly status: ConfirmedActionStatus;
  readonly ask: () => void;
  readonly cancel: () => void;
  readonly run: () => Promise<void>;
}

/**
 * The confirm → busy → done/failed steps of a destructive settings action.
 * @param action - The work to run once confirmed.
 * @param onSettled - Called after the work, whatever its outcome.
 * @returns The status and its transitions.
 */
export function useConfirmedAction(
  action: () => Promise<void>,
  onSettled?: () => void,
): ConfirmedAction {
  const [status, setStatus] = useState<ConfirmedActionStatus>("idle");

  const run = useCallback(async (): Promise<void> => {
    setStatus("busy");
    try {
      await action();
      setStatus("done");
    } catch (err) {
      console.error("[maintenance] Action failed", err);
      setStatus("failed");
    }
    onSettled?.();
  }, [action, onSettled]);

  return {
    status,
    ask: () => setStatus("confirm"),
    cancel: () => setStatus("idle"),
    run,
  };
}
