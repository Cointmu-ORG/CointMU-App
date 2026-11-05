import { app, dialog } from "electron";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { arch, release, type } from "node:os";
import { promisify } from "node:util";
import { readAppInfo } from "../app/system";
import { resolveGethBinaryPath } from "../geth/process/gethInit";
import { getNetworkId } from "../geth/process/networkConfig";
import { resolveDialogText } from "../ipc/dialogText";
import { collectDiagnosticBundle } from "./diagnosticBundle";
import { getLogsDir } from "./logging";
import { buildZip } from "./zipWriter";

const execFileAsync = promisify(execFile);
const GETH_VERSION_TIMEOUT_MS = 5_000;
const UNKNOWN = "unknown";
const SAVE_DIALOG = {
  title: "Export diagnostic bundle",
  filterName: "ZIP Archive",
};

/** @returns The bundled geth's `version` output, or "unknown". */
async function readGethVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      resolveGethBinaryPath(),
      ["version"],
      { timeout: GETH_VERSION_TIMEOUT_MS, windowsHide: true },
    );
    return stdout.trim();
  } catch (err) {
    console.warn("[diagnostics] Could not read the geth version:", err);
    return UNKNOWN;
  }
}

/** @returns App, runtime, geth and OS versions. */
async function readVersions(): Promise<Record<string, string>> {
  const info = readAppInfo(app.getAppPath());
  return {
    app: `${info.version} ${info.codename} (${info.build})`,
    electron: process.versions.electron ?? UNKNOWN,
    chrome: process.versions.chrome ?? UNKNOWN,
    node: process.versions.node,
    geth: await readGethVersion(),
    networkId: getNetworkId(),
    os: `${type()} ${release()} ${arch()}`,
  };
}

/**
 * Asks where to save and writes the diagnostic bundle there.
 * @param store - The settings store; only non-secret sections are read.
 * @param dialogText - Save dialog text from the renderer.
 * @returns True once saved, false when the dialog was cancelled.
 */
export async function exportDiagnosticBundle(
  store: { readonly store: Readonly<Record<string, unknown>> },
  dialogText: unknown,
): Promise<boolean> {
  const text = resolveDialogText(dialogText, SAVE_DIALOG);
  const day = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog({
    title: text.title,
    defaultPath: `CointMU-diagnostics-${day}.zip`,
    filters: [{ name: text.filterName, extensions: ["zip"] }],
  });
  if (result.canceled || !result.filePath) return false;
  const entries = await collectDiagnosticBundle({
    logsDir: getLogsDir(),
    settings: store.store,
    versions: readVersions,
  });
  await writeFile(result.filePath, buildZip(entries));
  return true;
}
