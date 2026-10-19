import * as ethers from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const EXTENSION_BASE = `chrome-extension://${EXTENSION_ID}/`;
const POPUP_SENDER = {
  id: EXTENSION_ID,
  url: `${EXTENSION_BASE}popup/popup.html?mode=approve`,
};
const DAPP = "https://dapp.example";
const TAB_ID = 7;
const CHAIN_ID = "1912";
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const ErrorCode = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  REQUEST_PENDING: -32002,
};

const signer = ethers.Wallet.createRandom();

function createChromeStub(initialState) {
  const storage = { ...initialState };
  const openedWindows = [];
  let nextWindowId = 100;
  return {
    storage,
    openedWindows,
    chrome: {
      runtime: {
        id: EXTENSION_ID,
        getURL: (path) => EXTENSION_BASE + path,
      },
      storage: {
        local: {
          get: async (keys) =>
            Object.fromEntries(
              keys.filter((k) => k in storage).map((k) => [k, storage[k]]),
            ),
          set: async (values) => Object.assign(storage, values),
        },
      },
      windows: {
        create: async ({ url }) => {
          const window = { id: nextWindowId++, url };
          openedWindows.push(window);
          return window;
        },
        remove: async () => {},
      },
    },
  };
}

function standaloneState() {
  return {
    connectionMode: "standalone",
    activeStandaloneAddress: signer.address,
    wallets: [{ address: signer.address, privateKey: signer.privateKey }],
    activeNetworkId: "net-1",
    customNetworks: [
      { id: "net-1", chainId: CHAIN_ID, rpcUrl: "http://127.0.0.1:1" },
    ],
  };
}

function pageSender(overrides = {}) {
  return { tab: { id: TAB_ID }, frameId: 0, origin: DAPP, ...overrides };
}

/** Sends a page request and resolves with the reply once it arrives. */
function sendFromPage(mod, message, sender = pageSender()) {
  return new Promise((resolve) => {
    mod.handleContentMessage(message, sender, resolve);
  });
}

function reqIdOf(window) {
  return new URL(window.url).searchParams.get("reqId");
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("dapp-requests (standalone)", () => {
  let stub;
  let mod;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.resetModules();
    stub = createChromeStub(standaloneState());
    vi.stubGlobal("chrome", stub.chrome);
    vi.stubGlobal("ethers", ethers);
    mod = await import("./dapp-requests.js");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function connect() {
    const reply = sendFromPage(mod, { id: 1, method: "eth_requestAccounts" });
    await flush();
    const popup = stub.openedWindows.at(-1);
    mod.handleApprovalResolution(
      { reqId: reqIdOf(popup), approved: true },
      POPUP_SENDER,
      () => {},
    );
    return reply;
  }

  it("refuses signing from a site that is not connected, without a popup", async () => {
    const reply = await sendFromPage(mod, {
      id: 1,
      method: "personal_sign",
      params: ["0x00", signer.address],
    });
    expect(reply.error.code).toBe(ErrorCode.UNAUTHORIZED);
    expect(stub.openedWindows).toHaveLength(0);
  });

  it("connects after approval and remembers the origin", async () => {
    expect((await connect()).result).toEqual([signer.address]);
    expect(stub.storage.connectedOrigins).toEqual([DAPP]);

    const again = await sendFromPage(mod, {
      id: 2,
      method: "eth_requestAccounts",
    });
    expect(again.result).toEqual([signer.address]);
    expect(stub.openedWindows).toHaveLength(1);
  });

  it("allows one pending connection request per origin", async () => {
    sendFromPage(mod, { id: 1, method: "eth_requestAccounts" });
    await flush();
    const second = await sendFromPage(mod, {
      id: 2,
      method: "eth_requestAccounts",
    });
    expect(second.error.code).toBe(ErrorCode.REQUEST_PENDING);
    expect(stub.openedWindows).toHaveLength(1);
  });

  it("signs a message after approval and resolves the request only once", async () => {
    await connect();
    const reply = sendFromPage(mod, {
      id: 3,
      method: "personal_sign",
      params: [ethers.hexlify(ethers.toUtf8Bytes("hello")), signer.address],
    });
    await flush();
    const reqId = reqIdOf(stub.openedWindows.at(-1));

    const query = vi.fn();
    mod.handlePendingRequestQuery({ reqId }, POPUP_SENDER, query);
    expect(query.mock.calls[0][0].view.rows.at(-1).value).toBe("hello");

    const first = vi.fn();
    mod.handleApprovalResolution(
      { reqId, approved: true },
      POPUP_SENDER,
      first,
    );
    expect(ethers.verifyMessage("hello", (await reply).result)).toBe(
      signer.address,
    );

    const second = vi.fn();
    mod.handleApprovalResolution(
      { reqId, approved: true },
      POPUP_SENDER,
      second,
    );
    expect(first).toHaveBeenCalledWith({ success: true });
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("ignores approvals that do not come from the popup page", async () => {
    sendFromPage(mod, { id: 1, method: "eth_requestAccounts" });
    await flush();
    const answer = vi.fn();
    mod.handleApprovalResolution(
      { reqId: reqIdOf(stub.openedWindows[0]), approved: true },
      { id: EXTENSION_ID, url: DAPP, tab: { id: TAB_ID } },
      answer,
    );
    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("rejects a request when the user does not answer in time", async () => {
    const reply = sendFromPage(mod, { id: 1, method: "eth_requestAccounts" });
    await flush();
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS);
    expect((await reply).error.code).toBe(ErrorCode.USER_REJECTED);
  });

  it("refuses requests from embedded frames", async () => {
    const reply = await sendFromPage(
      mod,
      { id: 1, method: "eth_requestAccounts" },
      pageSender({ frameId: 3 }),
    );
    expect(reply.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("uses the browser-reported origin, not the message body", async () => {
    await connect();
    const reply = await sendFromPage(
      mod,
      {
        id: 4,
        method: "personal_sign",
        params: ["0x00", signer.address],
        origin: DAPP,
      },
      pageSender({ origin: "https://evil.example" }),
    );
    expect(reply.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("refuses eth_sign without a popup", async () => {
    await connect();
    const reply = await sendFromPage(mod, {
      id: 5,
      method: "eth_sign",
      params: [signer.address, "0x00"],
    });
    expect(reply.error.code).toBe(ErrorCode.UNSUPPORTED_METHOD);
    expect(stub.openedWindows).toHaveLength(1);
  });
});

describe("dapp-requests (desktop)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses signing in desktop mode without a popup", async () => {
    vi.resetModules();
    const stub = createChromeStub({ connectionMode: "desktop" });
    vi.stubGlobal("chrome", stub.chrome);
    const mod = await import("./dapp-requests.js");
    const reply = await sendFromPage(mod, {
      id: 1,
      method: "eth_sendTransaction",
      params: [{ from: signer.address }],
    });
    expect(reply.error.code).toBe(ErrorCode.UNSUPPORTED_METHOD);
    expect(stub.openedWindows).toHaveLength(0);
  });
});
