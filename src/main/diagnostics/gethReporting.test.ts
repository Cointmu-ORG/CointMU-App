import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/electron/main";
import { NodeRecoveryStage } from "../../bridge/types";
import { BootnodeConfigProblem } from "../geth/bootnode";
import {
  recordGethLine,
  reportBootnodeConfigProblem,
  reportRecoveryEvent,
} from "./gethReporting";

vi.mock("@sentry/electron/main", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const UNKNOWN_FATAL_LINE =
  "Fatal: Failed to start mining: dial 10.64.24.101:30303 timeout after 15s";

describe("recordGethLine", () => {
  beforeEach(() => {
    vi.mocked(Sentry.addBreadcrumb).mockClear();
  });

  it("ignores ordinary log lines", () => {
    recordGethLine(
      "INFO [10-20|12:33:05.738] Maximum peer count ETH=50 LES=0 total=50",
    );

    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("records a fatal line with its classified kind", () => {
    recordGethLine(UNKNOWN_FATAL_LINE);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "geth",
      level: "fatal",
      message: `UNKNOWN_FATAL: ${UNKNOWN_FATAL_LINE}`,
    });
  });
});

describe("reportRecoveryEvent", () => {
  beforeEach(() => {
    vi.mocked(Sentry.addBreadcrumb).mockClear();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  it("only leaves a breadcrumb for non-terminal stages", () => {
    reportRecoveryEvent({
      stage: NodeRecoveryStage.RETRYING,
      attempt: 1,
      maxAttempts: 3,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "recovery",
      level: "info",
      message: "retrying attempt 1/3",
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("reports FAILED grouped by the last fatal line, without its numbers or IP", () => {
    recordGethLine(UNKNOWN_FATAL_LINE);

    reportRecoveryEvent({
      stage: NodeRecoveryStage.FAILED,
      needsAttention: true,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      `geth recovery failed: ${UNKNOWN_FATAL_LINE}`,
      {
        level: "error",
        tags: { "geth.kind": "UNKNOWN_FATAL", "recovery.stage": "failed" },
        fingerprint: [
          "geth-recovery-failed",
          "Fatal: Failed to start mining: dial [REDACTED:ip]:# timeout after #s",
        ],
      },
    );
  });
});

describe("reportBootnodeConfigProblem", () => {
  beforeEach(() => {
    vi.mocked(Sentry.addBreadcrumb).mockClear();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  it("leaves a breadcrumb and reports a warning with the problem code only", () => {
    reportBootnodeConfigProblem(BootnodeConfigProblem.INVALID_BUILD_VALUE);

    const message = "bootnode config rejected: invalid-build-value";
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "geth",
      level: "warning",
      message,
    });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(message, {
      level: "warning",
    });
  });
});
