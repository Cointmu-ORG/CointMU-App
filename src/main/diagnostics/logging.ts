import { app, clipboard, shell } from "electron";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import log from "electron-log/main";
import { sanitizeLocal } from "./localSanitizer";

const LOGS_DIR_NAME = "logs";
const MAIN_LOG_FILE = "main.log";
const GETH_LOG_FILE = "geth.log";
const MAIN_LOG_MAX_BYTES = 1024 * 1024;
const GETH_LOG_MAX_BYTES = 5 * 1024 * 1024;
const FILE_LOG_LEVEL = "info";
const RECENT_LOG_BYTES = 64 * 1024;
const RECENT_LOG_LINES = 200;
const INSPECT_DEPTH = 3;

/** geth stdout/stderr, one line per entry, in its own rotating file. */
export const gethLog = log.create({ logId: "geth" });

type FileLogger = typeof gethLog;
type LogMessage = Parameters<FileLogger["hooks"][number]>[0];

/** @returns The folder holding main.log and geth.log. */
export function getLogsDir(): string {
  return join(app.getPath("userData"), LOGS_DIR_NAME);
}

function toSanitizedText(item: unknown): string {
  if (typeof item === "string") return sanitizeLocal(item);
  if (item instanceof Error) return sanitizeLocal(item.stack ?? String(item));
  return sanitizeLocal(inspect(item, { depth: INSPECT_DEPTH }));
}

function sanitizeMessage(message: LogMessage): LogMessage {
  return { ...message, data: message.data.map(toSanitizedText) };
}

function configureFile(
  logger: FileLogger,
  fileName: string,
  maxSize: number,
): void {
  logger.transports.file.resolvePathFn = () => join(getLogsDir(), fileName);
  logger.transports.file.maxSize = maxSize;
  logger.transports.file.level = FILE_LOG_LEVEL;
  logger.hooks.push(sanitizeMessage);
}

/**
 * Starts file logging in userData/logs: main + renderer go to main.log, geth to
 * geth.log, each rotated to one `.old` file at its size cap. Every line passes
 * the sanitizer before any transport sees it, and `console.*` in main is routed
 * through the logger.
 */
export function initLogging(): void {
  // The preload imports electron-log/preload itself so it works when sandboxed.
  log.initialize({ preload: false });
  configureFile(log, MAIN_LOG_FILE, MAIN_LOG_MAX_BYTES);
  configureFile(gethLog, GETH_LOG_FILE, GETH_LOG_MAX_BYTES);
  gethLog.transports.file.format = "{text}";
  // geth is chatty; async writes keep it off the main thread.
  gethLog.transports.file.sync = false;
  Object.assign(console, log.functions);
}

async function readTail(path: string): Promise<string> {
  const handle = await open(path, "r").catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  if (!handle) return "";
  try {
    const { size } = await handle.stat();
    const start = Math.max(size - RECENT_LOG_BYTES, 0);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines.slice(-RECENT_LOG_LINES).join("\n");
  } finally {
    await handle.close();
  }
}

/**
 * Copies the last lines of main.log and geth.log to the clipboard, sanitized
 * again in case a file predates the current rules.
 * @returns The number of characters copied.
 */
export async function copyRecentLogs(): Promise<number> {
  const sections = await Promise.all(
    [MAIN_LOG_FILE, GETH_LOG_FILE].map(async (fileName) => {
      const tail = await readTail(join(getLogsDir(), fileName));
      return `=== ${fileName} ===\n${sanitizeLocal(tail)}`;
    }),
  );
  const text = sections.join("\n\n");
  clipboard.writeText(text);
  return text.length;
}

/**
 * Opens the logs folder in the OS file manager.
 * @throws When the OS cannot open the folder.
 */
export async function openLogsFolder(): Promise<void> {
  const dir = getLogsDir();
  await mkdir(dir, { recursive: true });
  const failure = await shell.openPath(dir);
  if (failure) throw new Error(`Could not open the logs folder: ${failure}`);
}
