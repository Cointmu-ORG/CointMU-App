import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EventEmitter } from "node:events";
import detectPort from "detect-port";
import { findAvailableP2pPort, findAvailablePort } from "./ports";

const udp = vi.hoisted(() => ({ takenPorts: new Set<number>() }));

vi.mock("detect-port", () => ({ default: vi.fn() }));

// A dgram socket whose bind fails for ports in udp.takenPorts.
vi.mock("node:dgram", () => ({
  createSocket: vi.fn(() => {
    const socket = new EventEmitter() as EventEmitter & {
      bind: (port: number, host: string, onBound: () => void) => void;
      close: (onClosed?: () => void) => void;
    };
    socket.bind = (port, _host, onBound) => {
      queueMicrotask(() =>
        udp.takenPorts.has(port)
          ? socket.emit("error", new Error("EADDRINUSE"))
          : onBound(),
      );
    };
    socket.close = (onClosed) => onClosed?.();
    return socket;
  }),
}));

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

describe("findAvailableP2pPort", () => {
  const P2P_PORT = 30303;

  beforeEach(() => {
    probe.mockReset();
    udp.takenPorts.clear();
  });

  it("skips a port that is free on TCP but taken on UDP", async () => {
    freePorts(P2P_PORT, P2P_PORT + 1);
    udp.takenPorts.add(P2P_PORT);

    await expect(findAvailableP2pPort(P2P_PORT)).resolves.toBe(P2P_PORT + 1);
  });

  it("returns the configured port when it is free on TCP and UDP", async () => {
    freePorts(P2P_PORT);

    await expect(findAvailableP2pPort(P2P_PORT)).resolves.toBe(P2P_PORT);
  });

  it("skips a port that is free on UDP but taken on TCP", async () => {
    freePorts(P2P_PORT + 1);

    await expect(findAvailableP2pPort(P2P_PORT)).resolves.toBe(P2P_PORT + 1);
  });

  it("falls back to the configured port when every port is taken", async () => {
    freePorts(
      ...Array.from({ length: MAX_PORT_SCAN_ATTEMPTS }, (_, i) => P2P_PORT + i),
    );
    for (let i = 0; i < MAX_PORT_SCAN_ATTEMPTS; i++) {
      udp.takenPorts.add(P2P_PORT + i);
    }

    await expect(findAvailableP2pPort(P2P_PORT)).resolves.toBe(P2P_PORT);
  });
});
