import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Runs the real content and page scripts in a sandbox that stands in for a
// browser window, to check which messages they accept and where they post.

const EXTENSION_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(EXTENSION_DIR, path), "utf8");
const PROTOCOL_JS = read("shared/protocol.js");
const CONTENT_JS = read("content/content.js");
const INJECTED_JS = read("content/injected.js");

const ORIGIN = "https://dapp.example";
const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const UNAUTHORIZED = 4100;

/** A sandbox global that acts as `window` for the scripts. */
function createWindow({ origin = ORIGIN, protocol = "https:" } = {}) {
  const listeners = [];
  const context = createContext({
    console,
    Error,
    Map,
    Promise,
    Array,
    Object,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  Object.assign(context, {
    location: { origin, protocol },
    postMessage: vi.fn(),
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    dispatchEvent: () => true,
  });
  context.window = context;
  // Inside the sandbox `window` is the global proxy, not `context` itself;
  // a message the window posts to itself has this object as event.source.
  const self = runInContext("globalThis", context);
  const deliver = (event) =>
    listeners.filter((l) => l.type === "message").forEach((l) => l.fn(event));
  return { context, self, deliver, listeners };
}

function loadContentScript(options) {
  const win = createWindow(options);
  const runtimeListeners = [];
  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getURL: (path) => `chrome-extension://${EXTENSION_ID}/${path}`,
      sendMessage: vi.fn(),
      onMessage: { addListener: (fn) => runtimeListeners.push(fn) },
    },
  };
  Object.assign(win.context, {
    chrome,
    document: {
      createElement: () => ({ addEventListener: () => {}, remove: () => {} }),
      head: { appendChild: () => {} },
    },
  });
  runInContext(PROTOCOL_JS, win.context);
  runInContext(CONTENT_JS, win.context);
  return { ...win, chrome, runtimeListeners };
}

function loadPageProvider(options) {
  const win = createWindow(options);
  runInContext(INJECTED_JS, win.context);
  return { ...win, provider: win.context.ethereum };
}

describe("content.js", () => {
  const request = { source: "cointmu-page", id: 1, method: "eth_accounts" };

  it("ignores a request posted by another window (cross-origin iframe)", () => {
    const { deliver, chrome } = loadContentScript();
    const iframe = { location: { origin: "https://ads.example" } };
    deliver({ source: iframe, origin: "https://ads.example", data: request });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores a same-window message with a foreign origin", () => {
    const { deliver, chrome, self } = loadContentScript();
    deliver({ source: self, origin: "https://ads.example", data: request });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("relays a page request without a self-declared origin and replies to the page origin only", () => {
    const { deliver, chrome, context, self } = loadContentScript();
    deliver({ source: self, origin: ORIGIN, data: request });

    const [message, reply] = chrome.runtime.sendMessage.mock.calls[0];
    expect(message).toEqual({
      id: 1,
      method: "eth_accounts",
      params: undefined,
    });
    reply({ result: ["0xabc"], error: null });
    expect(context.postMessage).toHaveBeenCalledWith(
      {
        id: 1,
        result: ["0xabc"],
        error: null,
        source: "cointmu-injected",
      },
      ORIGIN,
    );
  });

  it("posts account changes to the page origin and ignores other senders", () => {
    const { runtimeListeners, context } = loadContentScript();
    const [onMessage] = runtimeListeners;

    onMessage(
      { type: "ACCOUNTS_CHANGED", accounts: ["0xabc"] },
      { id: "other" },
    );
    expect(context.postMessage).not.toHaveBeenCalled();

    onMessage(
      { type: "ACCOUNTS_CHANGED", accounts: ["0xabc"] },
      { id: EXTENSION_ID },
    );
    expect(context.postMessage).toHaveBeenCalledWith(
      {
        type: "COINTMU_ACCOUNTS_CHANGED",
        accounts: ["0xabc"],
        source: "cointmu-injected",
      },
      ORIGIN,
    );
  });

  it("does not listen or relay on an opaque page", () => {
    const { listeners, runtimeListeners } = loadContentScript({
      origin: "null",
    });
    expect(listeners).toHaveLength(0);
    expect(runtimeListeners).toHaveLength(0);
  });
});

describe("injected.js", () => {
  it("posts requests to the page origin only", () => {
    const { provider, context } = loadPageProvider();
    provider.request({ method: "eth_accounts" });
    expect(context.postMessage).toHaveBeenCalledWith(
      { source: "cointmu-page", id: 1, method: "eth_accounts", params: [] },
      ORIGIN,
    );
  });

  it("settles only on a reply from the content script in this window", async () => {
    const { provider, deliver, self } = loadPageProvider();
    const pending = provider.request({ method: "eth_accounts" });
    const reply = { source: "cointmu-injected", id: 1, result: ["0xreal"] };

    deliver({
      source: { location: { origin: "https://ads.example" } },
      origin: "https://ads.example",
      data: { ...reply, result: ["0xforged"] },
    });
    deliver({ source: self, origin: ORIGIN, data: reply });

    await expect(pending).resolves.toEqual(["0xreal"]);
  });

  it("rejects with the EIP-1193 code from the wallet", async () => {
    const { provider, deliver, self } = loadPageProvider();
    const pending = provider.request({ method: "personal_sign" });
    deliver({
      source: self,
      origin: ORIGIN,
      data: {
        source: "cointmu-injected",
        id: 1,
        error: { code: UNAUTHORIZED, message: "Connect first" },
      },
    });
    await expect(pending).rejects.toMatchObject({
      code: UNAUTHORIZED,
      message: "Connect first",
    });
  });

  it("ignores forged account events from another window", () => {
    const { provider, deliver, self } = loadPageProvider();
    const onAccounts = vi.fn();
    provider.on("accountsChanged", onAccounts);
    const event = {
      source: "cointmu-injected",
      type: "COINTMU_ACCOUNTS_CHANGED",
      accounts: ["0xabc"],
    };

    deliver({ source: {}, origin: ORIGIN, data: event });
    expect(onAccounts).not.toHaveBeenCalled();

    deliver({ source: self, origin: ORIGIN, data: event });
    expect(onAccounts).toHaveBeenCalledWith(["0xabc"]);
  });

  it("rejects requests on an opaque page without posting anything", async () => {
    const { provider, context } = loadPageProvider({ origin: "null" });
    await expect(
      provider.request({ method: "eth_accounts" }),
    ).rejects.toMatchObject({ code: UNAUTHORIZED });
    expect(context.postMessage).not.toHaveBeenCalled();
  });
});

describe("injected.js protocol copy", () => {
  it("matches the shared protocol values", () => {
    const context = createContext({});
    runInContext(PROTOCOL_JS, context);
    const { MessageSource, PageEvent } = runInContext(
      "globalThis.CointMUProtocol",
      context,
    );
    for (const value of [
      ...Object.values(MessageSource),
      ...Object.values(PageEvent),
    ]) {
      expect(INJECTED_JS).toContain(`"${value}"`);
    }
  });
});
