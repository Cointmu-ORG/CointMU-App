import { ipcMain } from "electron";
import { CHAINDATA_CHANNELS } from "../../bridge/ipc-channels";
import { assertNodeStarted } from "../geth/process/nodeStartup";
import {
  ChainResyncError,
  type ChainResyncInfo,
  type ChainResyncResult,
} from "../../bridge/types";
import { getDirectorySize } from "../app/directorySize";
import {
  dropBackupWhenCaughtUp,
  isResyncInProgress,
  resyncFromGenesis,
} from "../geth/process/chainResync";
import {
  getNodeRecovery,
  hasGethExited,
  killGethProcess,
  spawnGethProcess,
} from "../geth/process/gethProcess";
import { initGethIfNeeded } from "../geth/process/gethInit";
import { resolveDataDir } from "../geth/process/networkConfig";
import { getRpcPort } from "../geth/process/ports";
import {
  listChainDataBackups,
  removeChainDataBackups,
} from "../geth/recovery/chaindataQuarantine";
import { resolveChainDataPath } from "../geth/recovery/recoveryPathGuard";
import { callGethRpc, safeParseHex } from "../geth/rpc/rpcUtils";
import { requestIndexRebuild } from "../explorerIndex/explorerIndexService";
import { setTokenScanPaused } from "../tokens/tokenScanService";
import type { AppStore } from "../store/appStore";

/** The head the resync backup had reached; removed once the new chain passes it. */
const BACKUP_HEAD_KEY = "chainResyncBackupHead";
const BACKUP_CHECK_INTERVAL_MS = 60_000;
const HEAD_RPC_TIMEOUT_MS = 5_000;

async function readHeadBlock(): Promise<number | null> {
  const head = await callGethRpc(
    getRpcPort(),
    "eth_blockNumber",
    [],
    HEAD_RPC_TIMEOUT_MS,
  );
  return typeof head === "string" ? safeParseHex(head) : null;
}

async function backupSizeBytes(): Promise<number> {
  const sizes = await Promise.all(
    (await listChainDataBackups(resolveDataDir())).map(getDirectorySize),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

/** Every channel here takes no arguments; anything sent along is refused. */
function assertNoArgs(channel: string, args: unknown[]): void {
  if (args.length > 0) throw new TypeError(`${channel} takes no arguments`);
}

/**
 * Registers "Resync from scratch" and "Delete backup", and removes the
 * backup on its own once the new chain passes the old head. The renderer
 * never names a path: main resolves the datadir and the backups itself.
 * @param store - The settings store; holds the backup's head block.
 */
export function registerChainResyncHandlers(store: AppStore): void {
  const readBackupHead = (): number | null => {
    const head: unknown = store.get(BACKUP_HEAD_KEY);
    return typeof head === "number" ? head : null;
  };
  const saveBackupHead = (head: number | null): void => {
    if (head === null) store.delete(BACKUP_HEAD_KEY);
    else store.set(BACKUP_HEAD_KEY, head);
  };

  ipcMain.handle(
    CHAINDATA_CHANNELS.GET_RESYNC_INFO,
    async (_, ...args: unknown[]): Promise<ChainResyncInfo> => {
      assertNoArgs(CHAINDATA_CHANNELS.GET_RESYNC_INFO, args);
      return {
        chainSizeBytes: await getDirectorySize(
          resolveChainDataPath(resolveDataDir()),
        ),
        backupSizeBytes: await backupSizeBytes(),
      };
    },
  );

  ipcMain.handle(
    CHAINDATA_CHANNELS.RESYNC,
    async (_, ...args: unknown[]): Promise<ChainResyncResult> => {
      assertNoArgs(CHAINDATA_CHANNELS.RESYNC, args);
      // A running recovery owns the chain data; a blocked/failed one is cleared.
      const recovery = getNodeRecovery();
      if (recovery && !recovery.resume()) {
        return { ok: false, error: ChainResyncError.BUSY };
      }
      return resyncFromGenesis({
        resolveDataDir,
        readHeadBlock,
        stopNode: killGethProcess,
        hasGethExited,
        setTokenScanPaused,
        initGenesis: initGethIfNeeded,
        startNode: () => spawnGethProcess(store),
        requestIndexRebuild,
        saveBackupHead,
      });
    },
  );

  ipcMain.handle(
    CHAINDATA_CHANNELS.DELETE_BACKUP,
    async (_, ...args: unknown[]): Promise<void> => {
      assertNoArgs(CHAINDATA_CHANNELS.DELETE_BACKUP, args);
      assertNodeStarted();
      if (isResyncInProgress()) throw new Error("A resync is running");
      await removeChainDataBackups(resolveDataDir());
      saveBackupHead(null);
    },
  );

  const cleanup = setInterval(() => {
    dropBackupWhenCaughtUp({
      readHeadBlock,
      readBackupHead,
      saveBackupHead,
      removeBackups: () => removeChainDataBackups(resolveDataDir()),
    }).catch((err: unknown) => {
      console.error("[resync] Could not remove the resync backup:", err);
    });
  }, BACKUP_CHECK_INTERVAL_MS);
  cleanup.unref();
}
