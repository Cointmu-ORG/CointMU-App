import { describe, expect, it } from "vitest";
import {
  CORRUPT_EXIT_WINDOW_MS,
  GethErrorKind,
  GethLineSeverity,
  classifyGethLine,
  extractListenPort,
  isCorruptionConfirmed,
} from "./gethErrorClassifier";

// "captured" samples were printed by the bundled core-geth 1.10.26 binary; the
// rest follow the goleveldb/pebble error formats geth wraps verbatim.
const PORT_IN_USE_LINES = [
  // captured
  "Fatal: Error starting protocol stack: listen tcp :30399: bind: address already in use",
  // captured (authrpc default port held by another node)
  "Fatal: Error starting protocol stack: listen tcp 127.0.0.1:8551: bind: address already in use",
  "Fatal: Error starting protocol stack: listen tcp 127.0.0.1:8585: bind: Only one usage of each socket address (protocol/network address/port) is normally permitted.",
];

const DB_LOCKED_LINES = [
  // captured
  "Fatal: Failed to create the protocol stack: datadir already used by another process",
  "Fatal: Failed to register the Ethereum service: resource temporarily unavailable",
  "Fatal: Failed to register the Ethereum service: open C:\\Users\\u\\AppData\\Roaming\\CointMU\\cointmu-chaindata\\geth\\chaindata\\LOCK: The process cannot access the file because it is being used by another process.",
];

// Built from the geth 1.10.26 Fatalf formats (cmd/utils/cmd.go:73,
// cmd/utils/flags.go:1994) around the raw Windows errno text.
const ACCESS_DENIED_LINES = [
  // npipe.Listen on an IPC pipe another geth still holds
  "Fatal: Error starting protocol stack: Access is denied.",
  // chaindata LOCK opened by goleveldb without the needed rights
  "Fatal: Failed to register the Ethereum service: Access is denied.",
];

const PORT_RESERVED_LINES = [
  "Fatal: Error starting protocol stack: listen tcp 127.0.0.1:8551: bind: An attempt was made to access a socket in a way forbidden by its access permissions.",
  "Fatal: Error starting protocol stack: listen udp :30303: bind: An attempt was made to access a socket in a way forbidden by its access permissions.",
];

const FATAL_CORRUPT_LINES = [
  "Fatal: Failed to register the Ethereum service: leveldb/table: corruption on data-block (pos=81920): checksum mismatch, want=0x9b1e2c4d got=0x00000000 [file=000123.ldb]",
  "Fatal: Failed to register the Ethereum service: leveldb: manifest corrupted (field 'comparer'): missing [file=MANIFEST-000010]",
  'CRIT [10-18|18:20:46.928] Failed to read block body                err="leveldb/table: corruption on data-block (pos=4096): checksum mismatch"',
  "Fatal: Failed to register the Ethereum service: pebble/table: invalid table 000005 (checksum mismatch at 0/1234)",
  "Fatal: Failed to register the Ethereum service: pebble: corruption: pebble/record: invalid chunk",
];

const BENIGN_LINES = [
  // captured: these two WARNs appear on every fresh genesis and used to loop the wipe
  'WARN [10-18|18:20:03.072] Failed to load snapshot, regenerating    err="missing or corrupted snapshot"',
  'WARN [10-18|18:20:03.074] Error reading unclean shutdown markers   error="leveldb: not found"',
  'INFO [10-18|18:20:03.050] Fatal error handler installed            leveldb="corruption checks enabled"',
  "WARN [10-18|18:20:03.050] Pebble reported a corrupt cache entry, rebuilding",
  "INFO [10-18|18:20:03.050] Error starting log rotation, fatal=false",
  'DEBUG[10-18|18:20:03.050] Retrying listen                          err="address already in use"',
  "",
];

describe("classifyGethLine", () => {
  it.each(PORT_IN_USE_LINES)("classifies port conflicts: %s", (line) => {
    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.PORT_IN_USE,
      severity: GethLineSeverity.FATAL,
    });
  });

  it.each(DB_LOCKED_LINES)("classifies database locks: %s", (line) => {
    expect(classifyGethLine(line)?.kind).toBe(GethErrorKind.DB_LOCKED);
  });

  it.each(ACCESS_DENIED_LINES)("classifies access denied: %s", (line) => {
    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.ACCESS_DENIED,
      severity: GethLineSeverity.FATAL,
    });
  });

  it.each(PORT_RESERVED_LINES)("classifies reserved ports: %s", (line) => {
    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.PORT_RESERVED,
      severity: GethLineSeverity.FATAL,
    });
  });

  it("keeps a sharing violation on the LOCK file as DB_LOCKED", () => {
    const line =
      "Fatal: Failed to register the Ethereum service: The process cannot access the file because it is being used by another process.";

    expect(classifyGethLine(line)?.kind).toBe(GethErrorKind.DB_LOCKED);
  });

  it.each(FATAL_CORRUPT_LINES)("classifies fatal corruption: %s", (line) => {
    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.DB_CORRUPT,
      severity: GethLineSeverity.FATAL,
    });
  });

  it.each(BENIGN_LINES)("ignores sub-ERROR lines: %s", (line) => {
    expect(classifyGethLine(line)).toBeNull();
  });

  it.each([
    'EROR[10-18|18:20:46.928] Failed to load block                     err="leveldb: corruption on journal-chunk (pos=12): invalid chunk"',
    'ERROR[10-18|18:20:46.928] Failed to load block                     err="pebble: corruption: checksum mismatch"',
  ])("keeps ERROR corruption at ERROR severity: %s", (line) => {
    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.DB_CORRUPT,
      severity: GethLineSeverity.ERROR,
    });
  });

  it("prefers a lock over corruption when the lock path mentions chaindata", () => {
    const line =
      "Fatal: Failed to open leveldb chaindata (corrupt check skipped): resource temporarily unavailable";

    expect(classifyGethLine(line)?.kind).toBe(GethErrorKind.DB_LOCKED);
  });

  it("marks unmatched Fatal lines as UNKNOWN_FATAL", () => {
    // captured
    const line =
      "Fatal: Failed to write genesis block: database contains incompatible genesis (have d4e5, new 51c5)";

    expect(classifyGethLine(line)).toEqual({
      kind: GethErrorKind.UNKNOWN_FATAL,
      severity: GethLineSeverity.FATAL,
    });
  });

  it.each([
    // captured
    'ERROR[10-19|11:20:57.333] Cannot start mining without etherbase    err="etherbase must be explicitly specified"',
    'EROR[10-18|18:20:46.928] Snapshot extension registration failed   peer=ab12 err="peer connected on snap without compatible eth support"',
  ])("ignores unmatched ERROR lines: %s", (line) => {
    expect(classifyGethLine(line)).toBeNull();
  });
});

describe("extractListenPort", () => {
  it.each([
    [PORT_RESERVED_LINES[0], 8551],
    [PORT_RESERVED_LINES[1], 30303],
    [PORT_IN_USE_LINES[0], 30399],
    // captured: geth 1.10.26 with UDP 30303 held by `nc -u -l 30303`
    [
      "Fatal: Error starting protocol stack: listen udp [::]:30303: bind: address already in use",
      30303,
    ],
  ])("reads the port from %s", (line, port) => {
    expect(extractListenPort(line)).toBe(port);
  });

  it("returns null when the line names no listen address", () => {
    expect(extractListenPort(ACCESS_DENIED_LINES[0])).toBeNull();
  });
});

describe("isCorruptionConfirmed", () => {
  const fatalCorrupt = {
    kind: GethErrorKind.DB_CORRUPT,
    severity: GethLineSeverity.FATAL,
  };
  const errorCorrupt = {
    kind: GethErrorKind.DB_CORRUPT,
    severity: GethLineSeverity.ERROR,
  };

  it("confirms Fatal/CRIT corruption without waiting for an exit", () => {
    expect(isCorruptionConfirmed(fatalCorrupt, null)).toBe(true);
  });

  it("confirms ERROR corruption when geth exits within the window", () => {
    expect(isCorruptionConfirmed(errorCorrupt, CORRUPT_EXIT_WINDOW_MS)).toBe(
      true,
    );
  });

  it("only logs ERROR corruption while geth keeps running", () => {
    expect(isCorruptionConfirmed(errorCorrupt, null)).toBe(false);
  });

  it("rejects ERROR corruption when the exit comes after the window", () => {
    expect(
      isCorruptionConfirmed(errorCorrupt, CORRUPT_EXIT_WINDOW_MS + 1),
    ).toBe(false);
  });

  it.each([
    { kind: GethErrorKind.PORT_IN_USE, severity: GethLineSeverity.FATAL },
    { kind: GethErrorKind.DB_LOCKED, severity: GethLineSeverity.FATAL },
    { kind: GethErrorKind.UNKNOWN_FATAL, severity: GethLineSeverity.FATAL },
  ])("never confirms $kind", (classification) => {
    expect(isCorruptionConfirmed(classification, 0)).toBe(false);
  });

  it("never confirms a null classification", () => {
    expect(isCorruptionConfirmed(null, 0)).toBe(false);
  });
});
