import { dialog, type BrowserWindow } from "electron";
import { readNodeStatus } from "../geth/rpc/nodeStatus";
import type { AppStore } from "../store/appStore";
import { getShellText } from "./shellText";

const CONFIRM_SETTING_KEY = "general.confirmQuitWhileBusy";
const QUIT_BUTTON = 0;
const CANCEL_BUTTON = 1;

/** The answer to the quit question. */
export interface QuitAnswer {
  readonly isConfirmed: boolean;
  /** The user ticked "Don't ask again". */
  readonly isNeverAskChecked: boolean;
}

export interface QuitConfirmationDeps {
  readonly isEnabled: () => boolean;
  /** True while geth mines or syncs. */
  readonly isBusy: () => Promise<boolean>;
  readonly ask: () => Promise<QuitAnswer>;
  /** Turns the question off (the user ticked "Don't ask again"). */
  readonly disable: () => void;
}

/**
 * Asks before quitting while the node mines or syncs, when the setting is on.
 * @param deps - Setting, node state and the dialog.
 * @returns True to go on quitting.
 */
export async function confirmQuitIfBusy(
  deps: QuitConfirmationDeps,
): Promise<boolean> {
  if (!deps.isEnabled() || !(await deps.isBusy())) return true;
  const answer = await deps.ask();
  if (answer.isConfirmed && answer.isNeverAskChecked) deps.disable();
  return answer.isConfirmed;
}

/**
 * @param win - The main window, the dialog's parent while it is visible.
 * @returns The user's answer from a native dialog in the UI language.
 */
async function askWithDialog(win: BrowserWindow): Promise<QuitAnswer> {
  const text = getShellText();
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    title: text.quitConfirmTitle,
    message: text.quitConfirmMessage,
    detail: text.quitConfirmDetail,
    buttons: [text.quitConfirmQuit, text.quitConfirmCancel],
    defaultId: CANCEL_BUTTON,
    cancelId: CANCEL_BUTTON,
    checkboxLabel: text.quitConfirmNeverAsk,
    noLink: true,
  };
  // A hidden (tray) window would hide its child dialog too.
  const isParentUsable = !win.isDestroyed() && win.isVisible();
  const result = isParentUsable
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);
  return {
    isConfirmed: result.response === QUIT_BUTTON,
    isNeverAskChecked: result.checkboxChecked,
  };
}

/**
 * @param store - The settings store.
 * @param win - The main window.
 * @param rpcPort - Reads the node's RPC port.
 * @returns The quit confirmation for setQuitConfirmation.
 */
export function createQuitConfirmation(
  store: AppStore,
  win: BrowserWindow,
  rpcPort: () => number,
): () => Promise<boolean> {
  return () =>
    confirmQuitIfBusy({
      isEnabled: () => store.get(CONFIRM_SETTING_KEY) !== false,
      isBusy: async () => {
        const status = await readNodeStatus(rpcPort());
        return status.isMining || status.syncPercent !== null;
      },
      ask: () => askWithDialog(win),
      disable: () => store.set(CONFIRM_SETTING_KEY, false),
    });
}
