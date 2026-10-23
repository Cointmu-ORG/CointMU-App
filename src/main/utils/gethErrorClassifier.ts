import ms from "ms";

export const GethErrorKind = {
  PORT_IN_USE: "PORT_IN_USE",
  DB_LOCKED: "DB_LOCKED",
  ACCESS_DENIED: "ACCESS_DENIED",
  PORT_RESERVED: "PORT_RESERVED",
  DB_CORRUPT: "DB_CORRUPT",
  UNKNOWN_FATAL: "UNKNOWN_FATAL",
} as const;

export type GethErrorKind = (typeof GethErrorKind)[keyof typeof GethErrorKind];

export const GethLineSeverity = {
  FATAL: "FATAL",
  ERROR: "ERROR",
} as const;

export type GethLineSeverity =
  (typeof GethLineSeverity)[keyof typeof GethLineSeverity];

export interface GethLineClassification {
  readonly kind: GethErrorKind;
  readonly severity: GethLineSeverity;
}

/**
 * How long geth may keep running after an ERROR-level corruption line for that
 * line to still count as the cause of the exit.
 */
export const CORRUPT_EXIT_WINDOW_MS = ms("10s");

// Geth prints 'Fatal: ' for startup aborts and a level token glued to '[' for
// log records: the bundled core-geth writes ERROR, some builds write EROR.
// Case-sensitive so a message merely starting with "Error" never matches.
const FATAL_LINE_PATTERN = /^\s*(?:Fatal:|CRIT\b)/;
const ERROR_LINE_PATTERN = /^\s*(?:EROR|ERROR)\b/;
// "listen tcp 127.0.0.1:8551: bind: ..." / "listen udp :30303: bind: ...".
const LISTEN_PORT_PATTERN = /\blisten (?:tcp|udp)\S* \S*:(\d+): bind:/;

// Ordered by priority: lock and port failures can mention the chaindata path,
// so they must win over the corruption patterns.
const KIND_RULES: ReadonlyArray<{ kind: GethErrorKind; pattern: RegExp }> = [
  {
    kind: GethErrorKind.PORT_IN_USE,
    pattern: /address already in use|only one usage of each socket address/i,
  },
  {
    kind: GethErrorKind.DB_LOCKED,
    pattern:
      /resource temporarily unavailable|datadir already used by another process|being used by another process/i,
  },
  // Windows ERROR_ACCESS_DENIED (5), English because Go asks FormatMessage for
  // en-US first (go1.18.5 syscall_windows.go:132). geth 1.10.26 surfaces it raw
  // from npipe.Listen when the IPC pipe already exists (FILE_FLAG_FIRST_PIPE_INSTANCE,
  // npipe_windows.go:228/517; rpc/ipc_windows.go:36) and from the LOCK file opens
  // (tsdb flock_windows.go:31, goleveldb file_storage_windows.go:44), which
  // node/errors.go:32 only maps to ErrDatadirUsed for errno 11/32/35.
  {
    kind: GethErrorKind.ACCESS_DENIED,
    pattern: /\bAccess is denied\./,
  },
  // Windows WSAEACCES (10013) on bind: the port sits in a range reserved by
  // Hyper-V/WSL/Docker (node/rpcstack.go:143, p2p/server.go:568).
  {
    kind: GethErrorKind.PORT_RESERVED,
    pattern: /forbidden by its access permissions/i,
  },
  {
    kind: GethErrorKind.DB_CORRUPT,
    pattern:
      /\b(?:leveldb|pebble)\b.*(?:corrupt|checksum mismatch|invalid chunk)|leveldb: not found/i,
  },
];

/**
 * Resolves the severity of a raw geth log line, or null when it is below ERROR.
 * @param line - A single complete geth log line.
 * @returns FATAL for 'Fatal:'/CRIT lines, ERROR for ERROR lines, otherwise null.
 */
function resolveSeverity(line: string): GethLineSeverity | null {
  if (FATAL_LINE_PATTERN.test(line)) return GethLineSeverity.FATAL;
  if (ERROR_LINE_PATTERN.test(line)) return GethLineSeverity.ERROR;
  return null;
}

/**
 * Classifies a single geth log line into a known failure kind. INFO/WARN/DEBUG
 * lines never classify, whatever words they contain. Unmatched Fatal/CRIT lines
 * become UNKNOWN_FATAL; unmatched ERROR lines are ignored.
 * @param line - A single complete geth log line.
 * @returns The kind and severity, or null when the line is not a failure.
 */
export function classifyGethLine(line: string): GethLineClassification | null {
  const severity = resolveSeverity(line);
  if (!severity) return null;

  const rule = KIND_RULES.find(({ pattern }) => pattern.test(line));
  if (rule) return { kind: rule.kind, severity };
  if (severity === GethLineSeverity.FATAL) {
    return { kind: GethErrorKind.UNKNOWN_FATAL, severity };
  }
  return null;
}

/**
 * Decides whether a corruption classification is strong enough to start data
 * recovery. Fatal/CRIT corruption always is; ERROR corruption only when geth
 * exited within CORRUPT_EXIT_WINDOW_MS of the line, since a node that keeps
 * running survived the error.
 * @param classification - The classified line, or null.
 * @param exitDelayMs - Milliseconds from the line to the geth exit, or null when geth is still running.
 * @returns True only when the data recovery flow may run.
 */
export function isCorruptionConfirmed(
  classification: GethLineClassification | null,
  exitDelayMs: number | null,
): boolean {
  if (classification?.kind !== GethErrorKind.DB_CORRUPT) return false;
  if (classification.severity === GethLineSeverity.FATAL) return true;
  return exitDelayMs !== null && exitDelayMs <= CORRUPT_EXIT_WINDOW_MS;
}

/**
 * Extracts the port from a geth "listen <net> <addr>:<port>: bind:" error.
 * @param line - A single geth log line.
 * @returns The port, or null when the line names none.
 */
export function extractListenPort(line: string): number | null {
  const match = LISTEN_PORT_PATTERN.exec(line);
  return match ? Number(match[1]) : null;
}
