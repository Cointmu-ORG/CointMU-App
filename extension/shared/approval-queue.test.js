import { describe, expect, it } from "vitest";
import { createApprovalQueue } from "./approval-queue.js";

const TIMEOUT_MS = 1000;
const TAB_A = 11;
const TAB_B = 22;
const POPUP_WINDOW = 99;
const ORIGIN = "https://dapp.example";

function setup() {
  let clock = 0;
  let counter = 0;
  const queue = createApprovalQueue({
    timeoutMs: TIMEOUT_MS,
    generateId: () => `uuid-${++counter}`,
    now: () => clock,
  });
  const advance = (ms) => {
    clock += ms;
  };
  return { queue, advance };
}

function pending(overrides = {}) {
  return {
    tabId: TAB_A,
    frameId: 0,
    requestId: 1,
    origin: ORIGIN,
    method: "personal_sign",
    request: null,
    sendResponse: () => {},
    ...overrides,
  };
}

describe("createApprovalQueue", () => {
  it("keeps same-id requests from two tabs apart", () => {
    const { queue } = setup();
    const a = queue.add(pending({ tabId: TAB_A, requestId: 1 }));
    const b = queue.add(pending({ tabId: TAB_B, requestId: 1 }));

    expect(a.id).not.toBe(b.id);
    expect(queue.take(a.id)?.tabId).toBe(TAB_A);
    expect(queue.peek(b.id)?.tabId).toBe(TAB_B);
  });

  it("resolves an id only once", () => {
    const { queue } = setup();
    const entry = queue.add(pending());

    expect(queue.take(entry.id)).not.toBeNull();
    expect(queue.take(entry.id)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    const { queue } = setup();
    expect(queue.take("missing")).toBeNull();
    expect(queue.peek("missing")).toBeNull();
  });

  it("expires entries after the timeout", () => {
    const { queue, advance } = setup();
    const entry = queue.add(pending());
    advance(TIMEOUT_MS);

    expect(queue.peek(entry.id)).toBeNull();
    expect(queue.removeExpired()).toEqual([entry]);
    expect(queue.size).toBe(0);
  });

  it("does not hand out an expired entry", () => {
    const { queue, advance } = setup();
    const entry = queue.add(pending());
    advance(TIMEOUT_MS);
    expect(queue.take(entry.id)).toBeNull();
  });

  it("removes every entry of a closed tab only", () => {
    const { queue } = setup();
    queue.add(pending({ tabId: TAB_A, requestId: 1 }));
    queue.add(pending({ tabId: TAB_A, requestId: 2 }));
    const other = queue.add(pending({ tabId: TAB_B }));

    expect(queue.removeByTab(TAB_A)).toHaveLength(2);
    expect(queue.peek(other.id)).not.toBeNull();
  });

  it("removes the entry whose popup window closed", () => {
    const { queue } = setup();
    const entry = queue.add(pending());
    queue.attachWindow(entry.id, POPUP_WINDOW);

    expect(queue.removeByWindow(POPUP_WINDOW)).toEqual([entry]);
    expect(queue.size).toBe(0);
  });

  it("reports a pending request per origin and method", () => {
    const { queue, advance } = setup();
    queue.add(pending({ method: "eth_requestAccounts" }));

    expect(queue.hasPending(ORIGIN, "eth_requestAccounts")).toBe(true);
    expect(queue.hasPending(ORIGIN, "personal_sign")).toBe(false);
    expect(
      queue.hasPending("https://other.example", "eth_requestAccounts"),
    ).toBe(false);

    advance(TIMEOUT_MS);
    expect(queue.hasPending(ORIGIN, "eth_requestAccounts")).toBe(false);
  });
});
