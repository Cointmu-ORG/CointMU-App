import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { wasOpenedInBackground } from "./loginItem";
import { isTrayShown } from "./tray";
import { isQuitInProgress, quitForSessionEnd } from "./appQuit";

const WINDOW_DEFAULT_WIDTH = 1280;
const WINDOW_DEFAULT_HEIGHT = 800;
const WINDOW_MIN_WIDTH = 900;
const WINDOW_MIN_HEIGHT = 600;

/**
 * Creates the main application BrowserWindow with security-hardened settings
 * and context-isolated preload script.
 * @returns The created BrowserWindow instance.
 */
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: "CointMU",
    icon:
      process.platform === "win32"
        ? join(__dirname, "../../resources/icon.ico")
        : join(__dirname, "../../resources/icon.png"),
    backgroundColor: "#0a0a0f",
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    if (wasOpenedInBackground()) mainWindow.minimize();
    else mainWindow.show();
  });

  // Close hides to the tray while it is shown (Settings → General). Without
  // the tray it quits with the window kept open, so the window can show a stop
  // that waits for geth (gethStopNotice.ts); app.exit closes it at the end.
  mainWindow.on("close", (event) => {
    if (isQuitInProgress()) return;
    if (isTrayShown()) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    if (process.platform === "darwin") return;
    event.preventDefault();
    app.quit();
  });

  // Windows: shutdown, restart or log off.
  mainWindow.on("session-end", quitForSessionEnd);

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}
