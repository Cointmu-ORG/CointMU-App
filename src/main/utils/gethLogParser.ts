type MiningLogLevel = "INFO" | "OK" | "WARN" | "ERROR";

interface MiningLog {
  id: string;
  timestamp: string;
  level: MiningLogLevel;
  message: string;
}

// Level tokens are padded to five columns, so ERROR/DEBUG/TRACE sit directly
// against '[' while INFO/WARN/CRIT get a space; some core-geth builds emit the
// four-letter EROR/DBUG/TRCE forms instead.
const GETH_LINE_PATTERN =
  /^(TRACE|TRCE|DEBUG|DBUG|INFO|WARN|ERROR|EROR|CRIT)\s*\[[^\]]*\]\s+(.*)$/;

const LEVEL_ALIASES: Readonly<Record<string, string>> = {
  TRCE: "TRACE",
  DBUG: "DEBUG",
  EROR: "ERROR",
};

interface EventRule {
  pattern: RegExp;
  level: MiningLogLevel;
}

const EVENT_RULES: EventRule[] = [
  { pattern: /successfully sealed new block/i, level: "OK" },
  { pattern: /mined potential block/i, level: "OK" },
  { pattern: /commit new (mining|sealing) work/i, level: "INFO" },
  { pattern: /block reached canonical chain/i, level: "INFO" },
  { pattern: /imported new chain segment/i, level: "INFO" },
  { pattern: /generating dag|generated ethash/i, level: "INFO" },
  { pattern: /reorg/i, level: "WARN" },
];

let logSequence = 0;

/**
 * Pads a number to two digits for fixed-width clock display.
 * @param value - The number to pad.
 * @returns The two-character zero-padded string.
 */
function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Produces a local HH:mm:ss timestamp for a freshly parsed log entry.
 * @returns The formatted current time string.
 */
function currentTimestamp(): string {
  const now = new Date();
  return `${padTwo(now.getHours())}:${padTwo(now.getMinutes())}:${padTwo(now.getSeconds())}`;
}

/**
 * Resolves a single Geth log line into a normalized mining level, or null when
 * the line is not a mining-relevant event. Curated mining phrases map to INFO or
 * OK; any line whose Geth level is WARN, ERROR, or CRIT is always surfaced so
 * failures are never dropped; all other lines are ignored to avoid flooding.
 * @param gethLevel - The raw level token at the start of the Geth line.
 * @param message - The human-readable portion of the Geth line.
 * @returns The normalized level, or null to skip the line.
 */
function resolveLevel(
  gethLevel: string,
  message: string,
): MiningLogLevel | null {
  for (const rule of EVENT_RULES) {
    if (rule.pattern.test(message)) {
      return rule.level;
    }
  }
  if (gethLevel === "ERROR" || gethLevel === "CRIT") {
    return "ERROR";
  }
  if (gethLevel === "WARN") {
    return "WARN";
  }
  return null;
}

/**
 * Parses a raw chunk of Geth output into normalized mining log objects. Only
 * complete, mining-relevant lines yield entries; unrecognized informational
 * lines are discarded. Whitespace runs in the message are collapsed for a clean
 * single-line terminal rendering.
 * @param chunk - A raw string chunk read from the Geth stdout or stderr stream.
 * @returns The mining log entries extracted from the chunk, in stream order.
 */
function parseGethLogChunk(chunk: string): MiningLog[] {
  const logs: MiningLog[] = [];
  const lines = chunk.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const match = trimmed.match(GETH_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const gethLevel = LEVEL_ALIASES[match[1]] ?? match[1];
    const rawMessage = match[2].replace(/\s{2,}/g, " ").trim();
    const level = resolveLevel(gethLevel, rawMessage);
    if (level === null) {
      continue;
    }

    logSequence += 1;
    logs.push({
      id: `${Date.now()}-${logSequence}`,
      timestamp: currentTimestamp(),
      level,
      message: rawMessage,
    });
  }

  return logs;
}

export { parseGethLogChunk };
export type { MiningLog, MiningLogLevel };
