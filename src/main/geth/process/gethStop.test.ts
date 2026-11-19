import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GETH_READY_LOG,
  GETH_READY_MARGIN_MS,
  GETH_READY_WAIT_MS,
  createGethReadiness,
} from "./gethReadiness";
import { stopProcess } from "./gethStop";
import {
  GETH_GRACEFUL_TIMEOUT_MS,
  SUPERVISOR_EXIT_MARGIN_MS,
} from "./orphanedGeth";

const REPAIR_MS = 120_000;

interface FakeProcess {
  proc: ChildProcess;
  kill: ReturnType<typeof vi.fn>;
  destroyStdin: ReturnType<typeof vi.fn>;
  exit: () => void;
}

function fakeProcess(hasStdin: boolean): FakeProcess {
  const emitter = new EventEmitter();
  const kill = vi.fn(() => true);
  const destroyStdin = vi.fn();
  const proc = Object.assign(emitter, {
    kill,
    stdin: hasStdin ? { destroy: destroyStdin } : null,
  }) as unknown as ChildProcess;
  return { proc, kill, destroyStdin, exit: () => emitter.emit("exit", 0) };
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

describe("stopProcess", () => {
  const realPlatform = process.platform;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setPlatform(realPlatform);
  });

  describe("outside Windows", () => {
    beforeEach(() => setPlatform("linux"));

    it("holds SIGINT back until geth is ready", async () => {
      const { proc, kill, exit } = fakeProcess(false);
      const readiness = createGethReadiness();
      const stopped = stopProcess(proc, readiness);

      await vi.advanceTimersByTimeAsync(REPAIR_MS);
      expect(kill).not.toHaveBeenCalled();

      readiness.observe(`INFO ${GETH_READY_LOG}`);
      await vi.advanceTimersByTimeAsync(GETH_READY_MARGIN_MS);
      expect(kill).toHaveBeenCalledWith("SIGINT");

      exit();
      await expect(stopped).resolves.toBeUndefined();
    });

    it("sends SIGINT at once to a geth ready for a while", async () => {
      const { proc, kill, exit } = fakeProcess(false);
      const readiness = createGethReadiness();
      readiness.observe(`INFO ${GETH_READY_LOG}`);
      await vi.advanceTimersByTimeAsync(GETH_READY_MARGIN_MS);

      const stopped = stopProcess(proc, readiness);
      await vi.advanceTimersByTimeAsync(0);

      expect(kill).toHaveBeenCalledWith("SIGINT");
      exit();
      await stopped;
    });

    it("kills a geth that never gets ready after the wait and grace", async () => {
      const { proc, kill } = fakeProcess(false);
      void stopProcess(proc, createGethReadiness());

      await vi.advanceTimersByTimeAsync(GETH_READY_WAIT_MS);
      expect(kill).toHaveBeenLastCalledWith("SIGINT");
      await vi.advanceTimersByTimeAsync(GETH_GRACEFUL_TIMEOUT_MS);

      expect(kill).toHaveBeenLastCalledWith("SIGKILL");
    });

    it("sends nothing to a geth that exits while starting", async () => {
      const { proc, kill, exit } = fakeProcess(false);
      const readiness = createGethReadiness();
      const stopped = stopProcess(proc, readiness);

      exit();
      readiness.release();
      await stopped;
      await vi.advanceTimersByTimeAsync(GETH_READY_WAIT_MS);

      expect(kill).not.toHaveBeenCalled();
    });
  });

  describe("on Windows", () => {
    beforeEach(() => setPlatform("win32"));

    it("gives the supervisor the ready wait before killing it", async () => {
      const { proc, kill, destroyStdin } = fakeProcess(true);
      void stopProcess(proc, createGethReadiness());
      expect(destroyStdin).toHaveBeenCalled();

      const supervisorMs = GETH_GRACEFUL_TIMEOUT_MS + SUPERVISOR_EXIT_MARGIN_MS;
      await vi.advanceTimersByTimeAsync(supervisorMs);
      expect(kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(
        GETH_READY_WAIT_MS + GETH_READY_MARGIN_MS,
      );

      expect(kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("kills a ready geth's supervisor after the grace and margin", async () => {
      const { proc, kill } = fakeProcess(true);
      const readiness = createGethReadiness();
      readiness.observe(`INFO ${GETH_READY_LOG}`);
      void stopProcess(proc, readiness);

      await vi.advanceTimersByTimeAsync(
        GETH_GRACEFUL_TIMEOUT_MS + SUPERVISOR_EXIT_MARGIN_MS,
      );

      expect(kill).toHaveBeenCalledWith("SIGKILL");
    });
  });
});
