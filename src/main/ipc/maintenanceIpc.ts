import { app, ipcMain, session } from "electron";
import { MAINTENANCE_CHANNELS } from "../../bridge/ipc-channels";
import type { DagInfo } from "../../bridge/types";
import { clearAppCache } from "../app/appCache";
import { requestIndexRebuild } from "../explorerIndex/explorerIndexService";
import { getRpcPort } from "../geth/process/ports";
import { callGethRpc } from "../geth/rpc/rpcUtils";
import {
  dagSizeBytes,
  deleteDagFiles,
  resolveDagDir,
} from "../mining/dagFiles";
import { resetTokenScan } from "../tokens/tokenScanService";
import { clearNftMediaCache } from "../tokens/nftMedia";

const MINING_RPC_TIMEOUT_MS = 2_000;

function dagDir(): string {
  return resolveDagDir(
    process.platform,
    app.getPath("home"),
    process.env.LOCALAPPDATA,
  );
}

async function isMining(): Promise<boolean> {
  const mining = await callGethRpc(
    getRpcPort(),
    "eth_mining",
    [],
    MINING_RPC_TIMEOUT_MS,
  );
  return mining === true;
}

/** Every channel here takes no arguments; anything sent along is refused. */
function assertNoArgs(channel: string, args: unknown[]): void {
  if (args.length > 0) throw new TypeError(`${channel} takes no arguments`);
}

/**
 * Registers "Clear cache" and "Delete mining DAG". The renderer never names
 * a path; main resolves the DAG folder and refuses while geth mines.
 */
export function registerMaintenanceHandlers(): void {
  ipcMain.handle(
    MAINTENANCE_CHANNELS.CLEAR_CACHE,
    async (_, ...args: unknown[]): Promise<void> => {
      assertNoArgs(MAINTENANCE_CHANNELS.CLEAR_CACHE, args);
      await clearAppCache({
        session: session.defaultSession,
        rebuildExplorerIndex: requestIndexRebuild,
        resetTokenScan,
        clearNftMedia: clearNftMediaCache,
      });
    },
  );

  ipcMain.handle(
    MAINTENANCE_CHANNELS.GET_DAG_INFO,
    async (_, ...args: unknown[]): Promise<DagInfo> => {
      assertNoArgs(MAINTENANCE_CHANNELS.GET_DAG_INFO, args);
      const [sizeBytes, mining] = await Promise.all([
        dagSizeBytes(dagDir()),
        isMining(),
      ]);
      return { sizeBytes, isMining: mining };
    },
  );

  ipcMain.handle(
    MAINTENANCE_CHANNELS.DELETE_DAG,
    async (_, ...args: unknown[]): Promise<void> => {
      assertNoArgs(MAINTENANCE_CHANNELS.DELETE_DAG, args);
      if (await isMining())
        throw new Error("Stop mining before deleting the DAG");
      await deleteDagFiles(dagDir());
    },
  );
}
