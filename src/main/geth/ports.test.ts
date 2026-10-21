import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import detectPort from "detect-port";
import { findAvailablePort } from "./ports";

vi.mock("detect-port", () => ({ default: vi.fn() }));

// detect-port is overloaded (promise and callback); the code under test only
// uses the promise form, so the mock is typed as that overload.
const probe = detectPort as unknown as Mock<(port: number) => Promise<number>>;

const START_PORT = 8585;
const MAX_PORT_SCAN_ATTEMPTS = 50;

/** detect-port resolves to the probed port when it is free, else another one. */
function freePorts(...free: number[]): void {
  probe.mockImplementation(async (port: number) =>
    free.includes(port) ? port : 0,
  );
}

describe("findAvailablePort", () => {
  beforeEach(() => {
    probe.mockReset();
  });

  it("returns the start port when it is free", async () => {
    freePorts(START_PORT);

    await expect(findAvailablePort(START_PORT)).resolves.toBe(START_PORT);
  });

  it("moves past ports that are taken", async () => {
    freePorts(START_PORT + 2);

    await expect(findAvailablePort(START_PORT)).resolves.toBe(START_PORT + 2);
  });

  it("never returns the reserved port, even when it looks free", async () => {
    freePorts(START_PORT, START_PORT + 1);

    await expect(findAvailablePort(START_PORT, START_PORT)).resolves.toBe(
      START_PORT + 1,
    );
  });

  it("keeps scanning when a probe throws", async () => {
    probe
      .mockRejectedValueOnce(new Error("EACCES"))
      .mockImplementation(async (port: number) => port);

    await expect(findAvailablePort(START_PORT)).resolves.toBe(START_PORT + 1);
  });

  it("falls back to the start port after the scan range is exhausted", async () => {
    freePorts();

    await expect(findAvailablePort(START_PORT)).resolves.toBe(START_PORT);
    expect(probe).toHaveBeenCalledTimes(MAX_PORT_SCAN_ATTEMPTS);
  });
});
