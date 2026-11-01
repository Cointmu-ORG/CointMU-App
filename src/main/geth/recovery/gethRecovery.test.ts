import { describe, expect, it, vi } from "vitest";
import {
  NodeRecoveryStage,
  type NodeRecoveryEvent,
} from "../../../bridge/types";
import { GethRecovery, type GethRecoveryDeps } from "./gethRecovery";
import { quarantineChainData } from "./chaindataQuarantine";

// Recovery waits seconds between restarts; the tests skip the waits and the
// disk: quarantine only renames a folder (covered in its own tests).
vi.mock("node:timers/promises", () => ({ setTimeout: async () => {} }));
vi.mock("./chaindataQuarantine", () => ({
  quarantineChainData: vi.fn(async () => "chaindata.corrupt-1"),
}));

// captured: geth prints every Fatal line to both stdout and stderr
const CAPTURED_UNKNOWN_FATAL =
  "Fatal: Error starting protocol stack: listen unix /tmp/x/geth.ipc: bind: invalid argument";
const CAPTURED_PORT_FATAL =
  "Fatal: Error starting protocol stack: listen tcp :30399: bind: address already in use";
const UNKNOWN_FATAL_MAX_RESTARTS = 5;
const MAX_FAILURE_LINE_CHARS = 300;

/**
 * Builds a recovery instance with inert dependencies that records broadcasts.
 * @returns The instance and the list of broadcast events.
 */
function createRecovery(): {
  recovery: GethRecovery;
  events: NodeRecoveryEvent[];
} {
  const events: NodeRecoveryEvent[] = [];
  const deps: GethRecoveryDeps = {
    spawnGeth: vi.fn(async () => {}),
    stopGeth: vi.fn(async () => {}),
    hasGethExited: () => true,
    initGenesis: vi.fn(async () => {}),
    resolveDataDir: () => "/data",
    resolveRpcPort: () => null,
    broadcast: (event) => events.push(event),
  };
  return { recovery: new GethRecovery(deps), events };
}

/**
 * Simulates one geth run that dies on a Fatal line echoed to both streams.
 * @param recovery - The recovery instance under test.
 * @param line - The Fatal line geth prints before exiting.
 */
function crashOnce(recovery: GethRecovery, line: string): void {
  recovery.handleLogLine(line);
  recovery.handleLogLine(line);
  recovery.handleUnexpectedExit();
}

describe("GethRecovery unknown fatal cap", () => {
  it("counts a duplicated Fatal line once per exit", () => {
    const { recovery } = createRecovery();

    for (let run = 0; run < UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);
    }

    expect(recovery.isRestartSuppressed()).toBe(false);
  });

  it("fails and suppresses restarts past the cap", () => {
    const { recovery, events } = createRecovery();

    for (let run = 0; run <= UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);
    }

    expect(recovery.isRestartSuppressed()).toBe(true);
    expect(events.at(-1)).toEqual({
      stage: NodeRecoveryStage.FAILED,
      needsAttention: true,
      failureKind: "UNKNOWN_FATAL",
      failureLine: CAPTURED_UNKNOWN_FATAL,
    });
  });

  it("reports the latest Fatal line, sanitized and truncated", () => {
    const { recovery, events } = createRecovery();
    const longFatal = `Fatal: Failed to open /home/alice/.cointmu/x\u001b[0m: ${"z".repeat(400)}`;
    for (let run = 0; run < UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);
    }

    crashOnce(recovery, longFatal);

    const line = events.at(-1)?.failureLine ?? "";
    expect(
      line.startsWith("Fatal: Failed to open /home/<user>/.cointmu/x"),
    ).toBe(true);
    expect(line).not.toContain("alice");
    expect(line).not.toContain("\u001b");
    expect(line).toHaveLength(MAX_FAILURE_LINE_CHARS);
    expect(line.endsWith("…")).toBe(true);
  });

  it("forgets the failure line on resume", () => {
    const { recovery, events } = createRecovery();
    for (let run = 0; run <= UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);
    }
    recovery.resume();

    for (let run = 0; run <= UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      recovery.handleLogLine("Fatal: different");
      recovery.handleUnexpectedExit();
    }

    expect(events.at(-1)?.failureLine).toBe("Fatal: different");
  });

  it("resets the counter on resume", () => {
    const { recovery } = createRecovery();
    for (let run = 0; run <= UNKNOWN_FATAL_MAX_RESTARTS; run++) {
      crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);
    }

    expect(recovery.resume()).toBe(true);
    crashOnce(recovery, CAPTURED_UNKNOWN_FATAL);

    expect(recovery.isRestartSuppressed()).toBe(false);
  });
});

describe("GethRecovery blocking", () => {
  it("blocks once on a port conflict without touching data", () => {
    const { recovery, events } = createRecovery();

    crashOnce(recovery, CAPTURED_PORT_FATAL);

    expect(recovery.isRestartSuppressed()).toBe(true);
    expect(events).toEqual([
      { stage: NodeRecoveryStage.BLOCKED, reason: "PORT_IN_USE" },
    ]);
  });
});

describe("GethRecovery Windows fatals", () => {
  it("blocks on access denied instead of counting toward the restart cap", () => {
    const { recovery, events } = createRecovery();

    crashOnce(
      recovery,
      "Fatal: Error starting protocol stack: Access is denied.",
    );

    expect(events).toEqual([
      { stage: NodeRecoveryStage.BLOCKED, reason: "ACCESS_DENIED" },
    ]);
  });

  it("does not block on an ERROR-level access denied", () => {
    const { recovery, events } = createRecovery();

    recovery.handleLogLine(
      'EROR[10-18|18:20:46.928] Failed to write file                     err="Access is denied."',
    );

    expect(recovery.isRestartSuppressed()).toBe(false);
    expect(events).toEqual([]);
  });

  it("blocks on a reserved port and reports which port", () => {
    const { recovery, events } = createRecovery();

    crashOnce(
      recovery,
      "Fatal: Error starting protocol stack: listen tcp 127.0.0.1:8551: bind: An attempt was made to access a socket in a way forbidden by its access permissions.",
    );

    expect(events).toEqual([
      { stage: NodeRecoveryStage.BLOCKED, reason: "PORT_RESERVED", port: 8551 },
    ]);
  });
});

describe("GethRecovery legacy-receipt fatal", () => {
  // captured: a Windows user's geth.log (1.6.18 → 1.7.2), printed on every start
  const LEGACY_RECEIPTS_FATAL =
    "Fatal: Database has receipts with a legacy format. Please run `geth db freezer-migrate`.";

  it("quarantines the chaindata and resyncs instead of restarting forever", async () => {
    const events: NodeRecoveryEvent[] = [];
    let isQuarantined = false;
    let isGethRunning = false;
    const initGenesis = vi.fn(async () => {
      isQuarantined = true;
    });
    const deps: GethRecoveryDeps = {
      // The damaged freezer aborts every start until it is moved aside.
      spawnGeth: vi.fn(async () => {
        if (isQuarantined) {
          isGethRunning = true;
          return;
        }
        recovery.handleLogLine(LEGACY_RECEIPTS_FATAL);
      }),
      stopGeth: vi.fn(async () => {
        isGethRunning = false;
      }),
      hasGethExited: () => !isGethRunning,
      initGenesis,
      resolveDataDir: () => "/data",
      resolveRpcPort: () => null,
      broadcast: (event) => events.push(event),
    };
    const recovery = new GethRecovery(deps);

    crashOnce(recovery, LEGACY_RECEIPTS_FATAL);
    await vi.waitFor(() =>
      expect(events.at(-1)?.stage).toBe(NodeRecoveryStage.RECOVERED),
    );

    expect(events.map((event) => event.stage)).toEqual([
      ...Array.from({ length: 3 }, () => [
        NodeRecoveryStage.RETRYING,
        NodeRecoveryStage.VERIFYING,
      ]).flat(),
      NodeRecoveryStage.QUARANTINED,
      NodeRecoveryStage.RESYNCING,
      NodeRecoveryStage.VERIFYING,
      NodeRecoveryStage.RECOVERED,
    ]);
    expect(quarantineChainData).toHaveBeenCalledOnce();
    expect(quarantineChainData).toHaveBeenCalledWith("/data");
    expect(initGenesis).toHaveBeenCalledWith("/data");
    expect(recovery.isRestartSuppressed()).toBe(false);
  });
});
