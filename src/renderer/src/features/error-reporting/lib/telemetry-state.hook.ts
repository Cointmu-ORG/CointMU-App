import { useCallback, useEffect, useState } from "react";
import type { TelemetryState } from "@bridge/types";
import {
  acknowledgeTelemetryNotice,
  getTelemetryState,
  setTelemetryEnabled,
} from "../api/error-reporting.service";

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
        setState(await action());
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
