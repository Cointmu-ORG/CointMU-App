import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  {
    address: "0x0000000000000000000000000000000000000001",
    privateKey: "0x" + "11".repeat(32),
  },
];

describe("vault-session", () => {
  let data;
  let releaseGet;
  let session;

  beforeEach(async () => {
    vi.resetModules();
    data = {};
    releaseGet = null;
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          setAccessLevel: async () => {},
          // Reads what is stored now, but answers only when the test
          // releases it, so an openSession can finish in between.
          get: (key) => {
            const snapshot = key in data ? { [key]: data[key] } : {};
            return new Promise((resolve) => {
              releaseGet = () => resolve(snapshot);
            });
          },
          set: async (values) => Object.assign(data, values),
          remove: async (key) => delete data[key],
        },
      },
      alarms: { create: async () => {}, clear: async () => true },
    });
    session = await import("./vault-session.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps an unlock that finishes while a read is still loading", async () => {
    const pendingRead = session.readSession();
    await session.openSession(KEYS);
    releaseGet();
    await pendingRead;

    expect(await session.readSession()).toEqual(KEYS);
  });
});
