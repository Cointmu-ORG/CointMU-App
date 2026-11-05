import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DBUS_PROBE_TIMEOUT_MS = 2_000;
// Electron's Linux tray is a StatusNotifierItem; it only shows when a host
// owns this name (KDE, XFCE, Cinnamon, GNOME with the AppIndicator extension).
const STATUS_NOTIFIER_WATCHER = "org.kde.StatusNotifierWatcher";

/**
 * Asks the session bus whether a tray host is running.
 * @returns True when a StatusNotifierWatcher owns its name; false when none
 *   does, or when dbus-send is missing or the bus cannot be reached.
 */
export async function hasStatusNotifierWatcher(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "dbus-send",
      [
        "--session",
        "--print-reply",
        "--dest=org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus.NameHasOwner",
        `string:${STATUS_NOTIFIER_WATCHER}`,
      ],
      { timeout: DBUS_PROBE_TIMEOUT_MS },
    );
    return /boolean true/.test(stdout);
  } catch (err) {
    console.info(
      "[tray] No tray host found on the session bus:",
      (err as Error).message,
    );
    return false;
  }
}

/**
 * Decides whether the app offers a tray icon. macOS keeps its dock
 * convention (closing the window leaves the app in the dock), Windows always
 * has a notification area, and Linux needs a tray host.
 * @param platform - The OS.
 * @param probeLinux - Checks for a Linux tray host.
 * @returns True when the tray can be shown.
 */
export async function detectTraySupport(
  platform: NodeJS.Platform,
  probeLinux: () => Promise<boolean> = hasStatusNotifierWatcher,
): Promise<boolean> {
  if (platform === "win32") return true;
  if (platform === "darwin") return false;
  return probeLinux();
}
