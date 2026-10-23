import { useCallback, useEffect, useState } from "react";
import type {
  BootnodeSaveError,
  BootnodeState,
  InvalidBootnodeEntry,
} from "@bridge/types";
import {
  getBootnodeState,
  resetBootnodes,
  saveBootnodes,
} from "../api/bootnode.service";

// Mirrors the main-process list format: one per line, comma-separated, or both.
const LIST_SEPARATOR = /[\s,]+/;
const LINE_BREAK = "\n";

export interface BootnodeRejection {
  readonly error: BootnodeSaveError;
  readonly invalid: readonly InvalidBootnodeEntry[];
}

export const BootnodeNotice = {
  SAVED: "saved",
  RESET: "reset",
  REQUEST_FAILED: "requestFailed",
} as const;

export type BootnodeNotice =
  (typeof BootnodeNotice)[keyof typeof BootnodeNotice];

export interface BootnodeSettingsHook {
  /** Null while loading or when the state could not be read. */
  readonly state: BootnodeState | null;
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  /** True when the draft lists different enodes than the saved custom list. */
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly rejection: BootnodeRejection | null;
  readonly notice: BootnodeNotice | null;
  readonly save: () => Promise<void>;
  readonly reset: () => Promise<void>;
}

function normalizeList(text: string): string {
  return text.split(LIST_SEPARATOR).filter(Boolean).join(LINE_BREAK);
}

/**
 * Loads the bootnode setting and exposes save and reset. Validation happens
 * in main; a rejection is kept so the form can point at the bad entries.
 * @returns The state, the editable draft, and the actions.
 */
export function useBootnodeSettings(): BootnodeSettingsHook {
  const [state, setState] = useState<BootnodeState | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [rejection, setRejection] = useState<BootnodeRejection | null>(null);
  const [notice, setNotice] = useState<BootnodeNotice | null>(null);

  const apply = useCallback((next: BootnodeState): void => {
    setState(next);
    setDraft(next.customEnodes.join(LINE_BREAK));
    setRejection(null);
  }, []);

  useEffect(() => {
    let isMounted = true;
    getBootnodeState()
      .then((next) => {
        if (isMounted) apply(next);
      })
      .catch((err: unknown) => {
        console.error("[bootnode] Failed to load bootnode settings", err);
        if (isMounted) setNotice(BootnodeNotice.REQUEST_FAILED);
      });
    return (): void => {
      isMounted = false;
    };
  }, [apply]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setIsSaving(true);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      console.error("[bootnode] Failed to update bootnode settings", err);
      setNotice(BootnodeNotice.REQUEST_FAILED);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const save = useCallback(
    () =>
      run(async () => {
        const result = await saveBootnodes(draft);
        if (!result.isSaved) {
          setRejection({ error: result.error, invalid: result.invalid });
          return;
        }
        apply(result.state);
        setNotice(BootnodeNotice.SAVED);
      }),
    [run, apply, draft],
  );

  const reset = useCallback(
    () =>
      run(async () => {
        apply(await resetBootnodes());
        setNotice(BootnodeNotice.RESET);
      }),
    [run, apply],
  );

  const isDirty =
    state !== null &&
    normalizeList(draft) !== state.customEnodes.join(LINE_BREAK);

  return {
    state,
    draft,
    setDraft,
    isDirty,
    isSaving,
    rejection,
    notice,
    save,
    reset,
  };
}
