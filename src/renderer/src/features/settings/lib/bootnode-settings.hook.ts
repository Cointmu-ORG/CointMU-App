import { useCallback, useEffect, useState } from "react";
import type {
  BootnodeEntry,
  BootnodeSaveError,
  BootnodeSettings,
  BootnodeState,
} from "@bridge/types";
import {
  getBootnodeState,
  resetBootnodes,
  saveBootnodes,
} from "../api/bootnode.service";

export const BootnodeNotice = {
  ADDED: "added",
  SAVED: "saved",
  RESET: "reset",
  REQUEST_FAILED: "requestFailed",
} as const;

export type BootnodeNotice =
  (typeof BootnodeNotice)[keyof typeof BootnodeNotice];

export interface BootnodeSettingsHook {
  /** Null while loading or when the state could not be read. */
  readonly state: BootnodeState | null;
  readonly isSaving: boolean;
  /** Why main rejected the last change. */
  readonly rejection: BootnodeSaveError | null;
  readonly notice: BootnodeNotice | null;
  /** Resolves true when the node was saved. */
  readonly addNode: (enode: string, label: string) => Promise<boolean>;
  readonly removeNode: (enode: string) => Promise<void>;
  readonly setNodeEnabled: (enode: string, isEnabled: boolean) => Promise<void>;
  readonly reset: () => Promise<void>;
}

/**
 * @param nodes - The listed nodes.
 * @returns The setting that keeps them as listed.
 */
export function toBootnodeSettings(
  nodes: readonly BootnodeEntry[],
): BootnodeSettings {
  return {
    custom: nodes
      .filter((node) => !node.isDefault)
      .map(({ enode, label }) => ({ enode, label })),
    disabled: nodes
      .filter((node) => node.isDefault && !node.isEnabled)
      .map((node) => node.enode),
  };
}

/**
 * Loads the node list and exposes add, remove, enable/disable and reset. Main
 * validates every change; a rejection is kept for the form to show.
 * @returns The state and the actions.
 */
export function useBootnodeSettings(): BootnodeSettingsHook {
  const [state, setState] = useState<BootnodeState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rejection, setRejection] = useState<BootnodeSaveError | null>(null);
  const [notice, setNotice] = useState<BootnodeNotice | null>(null);

  useEffect(() => {
    let isMounted = true;
    getBootnodeState()
      .then((next) => {
        if (isMounted) setState(next);
      })
      .catch((err: unknown) => {
        console.error("[bootnode] Failed to load the node list", err);
        if (isMounted) setNotice(BootnodeNotice.REQUEST_FAILED);
      });
    return (): void => {
      isMounted = false;
    };
  }, []);

  const save = useCallback(
    async (nodes: readonly BootnodeEntry[], success: BootnodeNotice) => {
      setIsSaving(true);
      setNotice(null);
      setRejection(null);
      try {
        const result = await saveBootnodes(toBootnodeSettings(nodes));
        if (!result.isSaved) {
          setRejection(result.error);
          return false;
        }
        setState(result.state);
        setNotice(success);
        return true;
      } catch (err) {
        console.error("[bootnode] Failed to save the node list", err);
        setNotice(BootnodeNotice.REQUEST_FAILED);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const nodes = state?.nodes ?? [];

  const addNode = (enode: string, label: string): Promise<boolean> =>
    save(
      [...nodes, { enode, label, host: "", isDefault: false, isEnabled: true }],
      BootnodeNotice.ADDED,
    );

  const removeNode = async (enode: string): Promise<void> => {
    await save(
      nodes.filter((node) => node.enode !== enode),
      BootnodeNotice.SAVED,
    );
  };

  const setNodeEnabled = async (
    enode: string,
    isEnabled: boolean,
  ): Promise<void> => {
    await save(
      nodes.map((node) =>
        node.enode === enode ? { ...node, isEnabled } : node,
      ),
      BootnodeNotice.SAVED,
    );
  };

  const reset = async (): Promise<void> => {
    setIsSaving(true);
    setNotice(null);
    setRejection(null);
    try {
      setState(await resetBootnodes());
      setNotice(BootnodeNotice.RESET);
    } catch (err) {
      console.error("[bootnode] Failed to reset the node list", err);
      setNotice(BootnodeNotice.REQUEST_FAILED);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    state,
    isSaving,
    rejection,
    notice,
    addNode,
    removeNode,
    setNodeEnabled,
    reset,
  };
}
