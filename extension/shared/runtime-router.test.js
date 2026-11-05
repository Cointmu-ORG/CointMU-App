import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const EXTENSION_BASE = `chrome-extension://${EXTENSION_ID}/`;
const POPUP_URL = `${EXTENSION_BASE}popup/popup.html`;
const DAPP = "https://dapp.example";
const PRIVATE_KEY = "0x" + "ab".repeat(32);
const ADDRESS = "0x00000000000000000000000000000000000000aa";
const EXTENSION_DIR = path.resolve(__dirname, "..");

const TOOLBAR_POPUP = { id: EXTENSION_ID, url: POPUP_URL };
const CONTENT_SCRIPT = {
  id: EXTENSION_ID,
  url: `${DAPP}/app`,
  origin: DAPP,
  tab: { id: 7, windowId: 1 },
  frameId: 0,
};

function createChromeStub(storage) {
  const openedWindows = [];
  return {
    openedWindows,
    chrome: {
      runtime: {
        id: EXTENSION_ID,
        getURL: (p) => EXTENSION_BASE + p,
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
          const window = { id: 200 + openedWindows.length, url };
          openedWindows.push(window);
          return window;
        },
        remove: async () => {},
      },
    },
  };
}

function send(mod, message, sender) {
  return new Promise((resolve) => {
    mod.handleRuntimeMessage(message, sender, resolve);
  });
}

describe("runtime-router sender checks", () => {
  let stub;
  let mod;

  beforeEach(async () => {
    vi.resetModules();
    stub = createChromeStub({
      connectionMode: "standalone",
      activeStandaloneAddress: ADDRESS,
      wallets: [{ address: ADDRESS, privateKey: PRIVATE_KEY }],
    });
    vi.stubGlobal("chrome", stub.chrome);
    mod = await import("./runtime-router.js");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the toolbar popup with addresses only", async () => {
    const state = await send(
      mod,
      { action: "GET_CURRENT_STATE" },
      TOOLBAR_POPUP,
    );
    expect(state.wallets).toEqual([{ address: ADDRESS }]);
    expect(JSON.stringify(state)).not.toContain(PRIVATE_KEY.slice(2));
  });

  it.each([
    ["a content script", CONTENT_SCRIPT],
    ["another extension", { ...TOOLBAR_POPUP, id: "otherextensionid" }],
    ["a web page URL", { id: EXTENSION_ID, url: `${DAPP}/popup/popup.html` }],
    [
      "the popup page opened in a tab",
      { ...TOOLBAR_POPUP, tab: { id: 9, windowId: 3 } },
    ],
  ])("refuses internal actions from %s", async (_label, sender) => {
    const reply = await send(mod, { action: "GET_CURRENT_STATE" }, sender);
    expect(reply).toEqual({
      success: false,
      errorCode: "FORBIDDEN_SENDER",
    });
  });

  it("lets an approval window use only the approval actions", async () => {
    send(mod, { id: 1, method: "eth_requestAccounts" }, CONTENT_SCRIPT);
    await vi.waitFor(() => expect(stub.openedWindows).toHaveLength(1));
    const [window] = stub.openedWindows;
    const approvalWindow = {
      id: EXTENSION_ID,
      url: window.url,
      tab: { id: 50, windowId: window.id },
    };
    const reqId = new URL(window.url).searchParams.get("reqId");

    const state = await send(
      mod,
      { action: "GET_CURRENT_STATE" },
      approvalWindow,
    );
    expect(state.errorCode).toBe("FORBIDDEN_SENDER");

    const pending = await send(
      mod,
      { action: "GET_PENDING_REQ", reqId },
      approvalWindow,
    );
    expect(pending.success).toBe(true);
  });

  it("sends messages without an action down the dApp path", async () => {
    const reply = await send(
      mod,
      { id: 1, method: "eth_accounts" },
      CONTENT_SCRIPT,
    );
    expect(reply).toEqual({ result: [], error: null });
  });
});

function extensionSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "lib" ? [] : extensionSources(full);
    }
    return /\.(js|html)$/.test(entry.name) && !entry.name.endsWith(".test.js")
      ? [full]
      : [];
  });
}

describe("external messaging", () => {
  it("declares no externally_connectable in the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(EXTENSION_DIR, "manifest.json"), "utf8"),
    );
    expect(manifest).not.toHaveProperty("externally_connectable");
  });

  it("registers no external message or connect listener", () => {
    const sources = extensionSources(EXTENSION_DIR);
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const code = readFileSync(file, "utf8");
      expect(code, file).not.toMatch(/\.on(Message|Connect)External\b/);
    }
  });
});
