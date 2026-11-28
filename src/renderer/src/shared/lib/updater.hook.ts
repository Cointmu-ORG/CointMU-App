import { useState, useEffect, useCallback } from "react";
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openReleasePage,
} from "@/shared/api";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdaterProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdaterInfo {
  version: string;
}

export interface UpdaterState {
  status: UpdaterStatus;
  info: UpdaterInfo | null;
  progress: UpdaterProgress | null;
  error: string | null;
}

export interface Updater extends UpdaterState {
  /** A downloaded update waits for the user's Restart now (install mode Ask). */
  shouldAskToInstall: boolean;
  /**
   * The available update is installed by hand from its release page (macOS
   * builds that are not notarized); download and install do nothing then.
   */
  isManualInstall: boolean;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  openReleasePage: () => Promise<void>;
}

const INITIAL_STATE: UpdaterState = {
  status: "idle",
  info: null,
  progress: null,
  error: null,
};

/**
 * Subscribes to the Electron auto-updater IPC bridge and exposes the reactive
 * update lifecycle state together with the manual check, download, and install
 * actions. Progress events retain the previously resolved version info, and the
 * progress object is cleared whenever the updater leaves the downloading state.
 * @returns {Updater} The current update state and the action dispatchers.
 */
export function useUpdater(): Updater {
  const [state, setState] = useState<UpdaterState>(INITIAL_STATE);
  const [shouldAskToInstall, setShouldAskToInstall] = useState(false);
  const [isManualInstall, setIsManualInstall] = useState(false);

  useEffect(() => {
    if (!window.api?.updater?.onStateChange) {
      return;
    }

    const unsubscribe = window.api.updater.onStateChange((event) => {
      if (event.status === "downloaded") {
        setShouldAskToInstall(event.shouldAskToInstall === true);
      }
      if (event.status === "available") {
        setIsManualInstall(event.isManualInstall === true);
      }
      setState((prev) => {
        switch (event.status) {
          case "checking":
            return {
              status: "checking",
              info: null,
              progress: null,
              error: null,
            };
          case "available":
            return {
              status: "available",
              info: event.info ?? null,
              progress: null,
              error: null,
            };
          case "not-available":
            return {
              status: "not-available",
              info: null,
              progress: null,
              error: null,
            };
          case "downloading":
            return {
              status: "downloading",
              info: prev.info,
              progress: event.progress ?? prev.progress,
              error: null,
            };
          case "downloaded":
            return {
              status: "downloaded",
              info: event.info ?? prev.info,
              progress: null,
              error: null,
            };
          case "error":
            return {
              status: "error",
              info: prev.info,
              progress: null,
              error: event.error ?? null,
            };
          default:
            return prev;
        }
      });
    });

    return unsubscribe;
  }, []);

  const check = useCallback((): Promise<void> => checkForUpdates(), []);
  const download = useCallback((): Promise<void> => downloadUpdate(), []);
  const install = useCallback((): Promise<void> => installUpdate(), []);
  const openPage = useCallback((): Promise<void> => openReleasePage(), []);

  return {
    ...state,
    shouldAskToInstall,
    isManualInstall,
    check,
    download,
    install,
    openReleasePage: openPage,
  };
}
