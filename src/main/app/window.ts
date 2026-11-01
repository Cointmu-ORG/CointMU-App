import { BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

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
    mainWindow.show();
  });

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
