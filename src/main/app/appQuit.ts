import { app, powerMonitor } from "electron";
import { killGethProcess } from "../geth/process/gethProcess";
import { removeTemporaryIpcDir } from "../geth/process/ipcEndpointLifecycle";

/** Why the app is quitting; only a user's quit may be questioned. */
export const QuitReason = {
  USER: "user",
  UPDATER: "updater",
  SESSION_END: "session-end",
} as const;

export type QuitReason = (typeof QuitReason)[keyof typeof QuitReason];

let isQuitting = false;
let isConfirming = false;
let reason: QuitReason = QuitReason.USER;
let confirmQuit: () => Promise<boolean> = () => Promise.resolve(true);

/** @returns True once a quit has started; the window then closes for real. */
export function isQuitInProgress(): boolean {
  return isQuitting;
}

/**
 * Marks the coming quit as not the user's own, so it is never questioned.
 * Call it right before the quit (quitAndInstall, OS shutdown).
 * @param next - Why the app is about to quit.
 */
export function markQuitReason(next: QuitReason): void {
  reason = next;
}

/**
 * @param confirm - Asks the user whether to quit; resolves true to go on.
 */
export function setQuitConfirmation(confirm: () => Promise<boolean>): void {
  confirmQuit = confirm;
}

/**
 * Quits for an ending OS session (shutdown, restart, log off), without the
 * confirmation. Windows reports it on the window (`session-end`).
 */
export function quitForSessionEnd(): void {
  markQuitReason(QuitReason.SESSION_END);
  app.quit();
}

function stopGethAndExit(): void {
  isQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
}

async function confirmThenQuit(): Promise<void> {
  isConfirming = true;
  let isConfirmed: boolean;
  try {
    isConfirmed = await confirmQuit();
  } catch (err) {
    console.error("[quit] Quit confirmation failed; quitting:", err);
    isConfirmed = true;
  } finally {
    isConfirming = false;
  }
  // An updater or OS quit may have taken over while the question was open.
  if (isConfirmed && !isQuitting) stopGethAndExit();
}

/**
 * Intercepts the quit sequence so the app does not terminate until the geth
 * child process has been given a chance to persist its chain state to disk.
 * Every quit goes through here: the title bar, the tray's Quit, the updater,
 * the OS. Only a user's quit can be held for confirmation; an updater install
 * or an ending OS session goes straight to the clean geth stop, also while a
 * confirmation is open.
 */
export function registerQuitHandler(): void {
  app.on("before-quit", (e) => {
    if (isQuitting) {
      return;
    }
    e.preventDefault();
    if (reason !== QuitReason.USER) {
      stopGethAndExit();
      return;
    }
    if (isConfirming) return;
    void confirmThenQuit();
  });

  app.whenReady().then(() => {
    // Linux and macOS. Electron passes an event whose preventDefault delays
    // the shutdown until the app quits; its typings omit the argument.
    powerMonitor.on("shutdown", (...args: unknown[]) => {
      const event = args[0] as { preventDefault?: () => void } | undefined;
      event?.preventDefault?.();
      quitForSessionEnd();
    });
  });
}
