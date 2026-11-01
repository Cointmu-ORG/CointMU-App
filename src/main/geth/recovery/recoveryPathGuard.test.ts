import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RecoveryPathError,
  assertSafeRecoveryTarget,
  buildQuarantinePath,
  isQuarantineName,
  resolveChainDataPath,
} from "./recoveryPathGuard";

const DATA_DIR = join(
  "/home",
  "user",
  ".config",
  "CointMU",
  "cointmu-chaindata",
  "1912",
);
const QUARANTINE_TIMESTAMP_MS = 1760800000000;

describe("assertSafeRecoveryTarget", () => {
  it.each([
    ["chaindata", resolveChainDataPath(DATA_DIR)],
    [
      "a quarantine backup",
      buildQuarantinePath(DATA_DIR, QUARANTINE_TIMESTAMP_MS),
    ],
  ])("allows %s", (_label, target) => {
    expect(() => assertSafeRecoveryTarget(DATA_DIR, target)).not.toThrow();
  });

  it.each([
    ["the keystore", join(DATA_DIR, "keystore")],
    ["a key file", join(DATA_DIR, "keystore", "UTC--2026-10-18--abc")],
    [
      "the keystore via traversal",
      join(DATA_DIR, "geth", "chaindata", "..", "..", "keystore"),
    ],
    ["the data dir (contains the keystore)", DATA_DIR],
    ["the geth dir", join(DATA_DIR, "geth")],
    ["a sibling of chaindata", join(DATA_DIR, "geth", "nodekey")],
    ["a chaindata subfolder", join(DATA_DIR, "geth", "chaindata", "ancient")],
    [
      "chaindata of another network",
      join(DATA_DIR, "..", "1913", "geth", "chaindata"),
    ],
    ["a look-alike name", join(DATA_DIR, "geth", "chaindata.corrupt-abc")],
  ])("refuses %s", (_label, target) => {
    expect(() => assertSafeRecoveryTarget(DATA_DIR, target)).toThrow(
      RecoveryPathError,
    );
  });
});

describe("isQuarantineName", () => {
  it("matches backups produced by buildQuarantinePath", () => {
    const name = `chaindata.corrupt-${QUARANTINE_TIMESTAMP_MS}`;

    expect(
      buildQuarantinePath(DATA_DIR, QUARANTINE_TIMESTAMP_MS).endsWith(name),
    ).toBe(true);
    expect(isQuarantineName(name)).toBe(true);
  });

  it.each([
    "chaindata",
    "keystore",
    "chaindata.corrupt-",
    "chaindata.corrupt-1.bak",
  ])("rejects %s", (name) => {
    expect(isQuarantineName(name)).toBe(false);
  });
});
