import { describe, expect, it } from "vitest";
import { parseGethLogChunk } from "./gethLogParser";

// "captured" samples were printed by the bundled core-geth 1.10.26 binary.
const CAPTURED_ERROR =
  'ERROR[10-19|11:20:57.333] Cannot start mining without etherbase    err="etherbase must be explicitly specified"';
const CAPTURED_WARN =
  'WARN [10-19|11:20:51.509] Failed to load snapshot, regenerating    err="missing or corrupted snapshot"';
const CAPTURED_INFO =
  "INFO [10-19|11:20:51.481] Maximum peer count                       ETH=0 LES=0 total=0";
const CAPTURED_DEBUG =
  'DEBUG[10-19|11:20:51.483] FS scan times                            list="69µs" set=500ns diff="1.2µs"';
const CAPTURED_TRACE =
  "TRACE[10-19|11:20:51.484] Started watching keystore folder         path=/tmp/d5/keystore";

describe("parseGethLogChunk", () => {
  it("surfaces ERROR lines glued to the timestamp bracket", () => {
    const [log] = parseGethLogChunk(CAPTURED_ERROR);

    expect(log).toMatchObject({
      level: "ERROR",
      message:
        'Cannot start mining without etherbase err="etherbase must be explicitly specified"',
    });
  });

  it("surfaces WARN lines", () => {
    expect(parseGethLogChunk(CAPTURED_WARN)[0]?.level).toBe("WARN");
  });

  it.each([CAPTURED_INFO, CAPTURED_DEBUG, CAPTURED_TRACE])(
    "drops non-mining low-level lines: %s",
    (line) => {
      expect(parseGethLogChunk(line)).toEqual([]);
    },
  );

  it.each([
    ["EROR[", "ERROR"],
    ["CRIT [", "ERROR"],
  ])("maps the '%s' token to %s", (prefix, level) => {
    const line = `${prefix}10-19|11:20:57.333] Something broke   err=x`;

    expect(parseGethLogChunk(line)[0]?.level).toBe(level);
  });

  it.each(["DBUG", "TRCE"])("drops the four-letter %s token", (token) => {
    expect(parseGethLogChunk(`${token}[10-19|11:20:51.483] noise`)).toEqual([]);
  });

  it("keeps curated mining events from DEBUG lines", () => {
    const line =
      "DEBUG[10-19|11:20:51.483] Commit new sealing work                  number=1 sealhash=ab12";

    expect(parseGethLogChunk(line)[0]?.level).toBe("INFO");
  });

  it("parses every line of a multi-line chunk in order", () => {
    const chunk = [CAPTURED_INFO, CAPTURED_WARN, CAPTURED_ERROR].join("\n");

    expect(parseGethLogChunk(chunk).map((log) => log.level)).toEqual([
      "WARN",
      "ERROR",
    ]);
  });
});
