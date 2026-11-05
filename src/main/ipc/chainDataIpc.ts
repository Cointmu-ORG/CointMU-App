import { BrowserWindow, dialog, ipcMain } from "electron";
import { CHAINDATA_CHANNELS } from "../../bridge/ipc-channels";
import type {
  ChainDataInfo,
  ChainDataMoveProgress,
  ChainDataMoveResult,
  ChainDataTarget,
} from "../../bridge/types";
import { getDirectorySize } from "../app/directorySize";
import {
  assessTarget,
  deleteOldChainData,
  moveChainData,
} from "../geth/process/chainDataMove";
import { killGethProcess, spawnGethProcess } from "../geth/process/gethProcess";
import {
  defaultDataRoot,
  resolveDataRoot,
  setDataRoot,
} from "../geth/process/networkConfig";
import { CHAIN_DATA_ROOT_KEY } from "../store/settingRules";
import type { AppStore } from "../store/appStore";
import { resolveDialogText } from "./dialogText";

const PICK_DIALOG = {
  title: "Choose a folder for the chain data",
  filterName: "",
};

/**
 * @param progress - Sent to every window.
 */
function sendProgress(progress: ChainDataMoveProgress): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(CHAINDATA_CHANNELS.PROGRESS, progress);
  });
}

/**
 * Registers the chain data location channels: info, picking and checking a
 * target, the move, and deleting the old data afterwards. The renderer can
 * only move to the folder main last picked and delete the root main last
 * moved away from; it never names a path to delete.
 * @param store - The settings store; holds the moved root.
 */
export function registerChainDataHandlers(store: AppStore): void {
  let pickedTarget: string | null = null;
  let oldRoot: string | null = null;

  ipcMain.handle(
    CHAINDATA_CHANNELS.GET_INFO,
    async (): Promise<ChainDataInfo> => ({
      root: resolveDataRoot(),
      sizeBytes: await getDirectorySize(resolveDataRoot()),
      isDefault: resolveDataRoot() === defaultDataRoot(),
    }),
  );

  ipcMain.handle(
    CHAINDATA_CHANNELS.PICK_TARGET,
    async (_, dialogText: unknown): Promise<ChainDataTarget | null> => {
      const text = resolveDialogText(dialogText, PICK_DIALOG);
      const picked = await dialog.showOpenDialog({
        title: text.title,
        properties: ["openDirectory", "createDirectory"],
      });
      const path = picked.filePaths[0];
      if (picked.canceled || !path) return null;
      const assessed = await assessTarget(resolveDataRoot(), path);
      pickedTarget = "error" in assessed ? null : path;
      return { path, ...assessed };
    },
  );

  ipcMain.handle(
    CHAINDATA_CHANNELS.MOVE,
    async (_, target: unknown): Promise<ChainDataMoveResult> => {
      if (typeof target !== "string" || target !== pickedTarget) {
        throw new TypeError("chaindata:move expects the folder just picked");
      }
      pickedTarget = null;
      const result = await moveChainData(target, {
        currentRoot: resolveDataRoot,
        stopNode: killGethProcess,
        startNode: () => spawnGethProcess(store),
        saveRoot: (root) => {
          store.set(CHAIN_DATA_ROOT_KEY, root);
          setDataRoot(root);
        },
        onPhase: (phase) => sendProgress({ phase }),
      });
      if (result.ok) oldRoot = result.oldRoot;
      return result;
    },
  );

  ipcMain.handle(CHAINDATA_CHANNELS.DELETE_OLD, async (): Promise<void> => {
    if (!oldRoot) throw new Error("No chain data left behind by a move");
    await deleteOldChainData(oldRoot, resolveDataRoot());
    oldRoot = null;
  });
}
