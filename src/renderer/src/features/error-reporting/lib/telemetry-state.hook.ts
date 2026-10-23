import { useCallback, useEffect, useState } from "react";
import type { TelemetryState } from "@bridge/types";
import {
  acknowledgeTelemetryNotice,
  getTelemetryState,
  setTelemetryEnabled,
} from "../api/error-reporting.service";

/**
 * Every mounted hook's setter, so a choice saved in one place (the first-run
 * notice) shows up in the others (Settings) without reopening them.
 */
const subscribers = new Set<(state: TelemetryState) => void>();

export interface TelemetryStateHook {
  /** Null while loading or when the state could not be read. */
  readonly state: TelemetryState | null;
  readonly isSaving: boolean;
  readonly setEnabled: (isEnabled: boolean) => Promise<void>;
  readonly acknowledge: () => Promise<void>;
}

/**
 * Loads the error reporting state and exposes the two consent actions.
 * @returns The state and actions.
 */
export function useTelemetryState(): TelemetryStateHook {
  const [state, setState] = useState<TelemetryState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    subscribers.add(setState);
    return (): void => {
      subscribers.delete(setState);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    getTelemetryState()
      .then((next) => {
        if (isMounted) setState(next);
      })
      .catch((err: unknown) => {
        console.error("[error-reporting] Failed to load reporting state", err);
      });
    return (): void => {
      isMounted = false;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<TelemetryState>): Promise<void> => {
      setIsSaving(true);
      try {
        const next = await action();
        subscribers.forEach((notify) => notify(next));
      } catch (err) {
        console.error("[error-reporting] Failed to save reporting choice", err);
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const setEnabled = useCallback(
    (isEnabled: boolean) => run(() => setTelemetryEnabled(isEnabled)),
    [run],
  );
  const acknowledge = useCallback(() => run(acknowledgeTelemetryNotice), [run]);

  return { state, isSaving, setEnabled, acknowledge };
}
