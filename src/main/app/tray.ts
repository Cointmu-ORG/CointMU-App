import {
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions,
} from "electron";
import { join } from "node:path";
import { getShellText, fillText, onShellTextChange } from "./shellText";
import type { ShellText } from "../../bridge/types";
import type { NodeStatus } from "../geth/rpc/nodeStatus";

const TRAY_REFRESH_MS = 5_000;
const TRAY_ICON_SIZE_PX = process.platform === "win32" ? 16 : 32;

/** What the tray menu does; wired by the app entry. */
export interface TrayActions {
  readonly showWindow: () => void;
  readonly isMiningEnabled: () => boolean;
  readonly setMiningEnabled: (enabled: boolean) => Promise<void>;
  readonly readStatus: () => Promise<NodeStatus>;
  readonly quit: () => void;
}

/**
 * @param status - The node status.
 * @param text - Localized shell text.
 * @returns The status lines shown at the top of the menu and in the tooltip.
 */
export function describeTrayStatus(
  status: NodeStatus,
  text: ShellText,
): string[] {
  if (!status.isOnline) return [text.trayOffline];
  const sync =
    status.syncPercent === null
      ? text.traySynced
      : fillText(text.traySyncing, {
          percent: Math.floor(status.syncPercent),
        });
  const mining = status.isMining ? text.trayMining : text.trayNotMining;
  const lines = [sync, mining];
  if (status.peers !== null) {
    lines.push(fillText(text.trayPeers, { count: status.peers }));
  }
  return lines;
}

/**
 * @param statusLines - From describeTrayStatus.
 * @param text - Localized shell text.
 * @param actions - The menu actions.
 * @returns The tray menu template.
 */
export function buildTrayMenuTemplate(
  statusLines: readonly string[],
  text: ShellText,
  actions: TrayActions,
): MenuItemConstructorOptions[] {
  const isMiningEnabled = actions.isMiningEnabled();
  return [
    ...statusLines.map((label) => ({ label, enabled: false })),
    { type: "separator" },
    { label: text.trayOpen, click: actions.showWindow },
    {
      label: isMiningEnabled ? text.trayStopMining : text.trayStartMining,
      click: () => {
        actions.setMiningEnabled(!isMiningEnabled).catch((err: unknown) => {
          console.warn("[tray] Could not toggle mining:", err);
          actions.showWindow();
        });
      },
    },
    { type: "separator" },
    { label: text.trayQuit, click: actions.quit },
  ];
}

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let stopTextListener: (() => void) | null = null;
let lastStatus: NodeStatus = {
  isOnline: false,
  syncPercent: null,
  isMining: false,
  peers: null,
};

function trayIcon(): Electron.NativeImage {
  const file = process.platform === "win32" ? "icon.ico" : "icon.png";
  return nativeImage
    .createFromPath(join(__dirname, "../../resources", file))
    .resize({ width: TRAY_ICON_SIZE_PX, height: TRAY_ICON_SIZE_PX });
}

function render(actions: TrayActions): void {
  if (!tray) return;
  const text = getShellText();
  const lines = describeTrayStatus(lastStatus, text);
  tray.setToolTip(["CointMU", ...lines].join("\n"));
  tray.setContextMenu(
    Menu.buildFromTemplate(buildTrayMenuTemplate(lines, text, actions)),
  );
}

async function refresh(actions: TrayActions): Promise<void> {
  try {
    lastStatus = await actions.readStatus();
  } catch (err) {
    console.warn("[tray] Could not read the node status:", err);
    lastStatus = { ...lastStatus, isOnline: false };
  }
  render(actions);
}

/**
 * Shows the tray icon (once) and keeps its status current.
 * @param actions - The menu actions.
 */
export function showTray(actions: TrayActions): void {
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.on("click", actions.showWindow);
  stopTextListener = onShellTextChange(() => render(actions));
  render(actions);
  void refresh(actions);
  refreshTimer = setInterval(() => void refresh(actions), TRAY_REFRESH_MS);
}

/** Removes the tray icon and stops its refresh. */
export function hideTray(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  stopTextListener?.();
  stopTextListener = null;
  tray?.destroy();
  tray = null;
}

/** @returns True while the tray icon is shown. */
export function isTrayShown(): boolean {
  return tray !== null;
}
