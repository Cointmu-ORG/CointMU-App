"use strict";

/**
 * In-memory queue of dApp requests waiting for the user in the approval
 * popup. Entries are keyed by an internal UUID, not by the page's request id,
 * which restarts at 1 on every page and would collide across tabs. An entry
 * can be taken exactly once.
 */

/**
 * @typedef {Object} ApprovalEntry
 * @property {string} id - Internal UUID; also the popup's reqId.
 * @property {number} tabId - Originating tab.
 * @property {number} frameId - Originating frame.
 * @property {number} requestId - The page's JSON-RPC id.
 * @property {string} origin - The browser-reported origin of the page.
 * @property {string} method - The JSON-RPC method.
 * @property {object | null} request - The validated signing request, or null for a connection request.
 * @property {Function} sendResponse - Replies to the content script.
 * @property {number} createdAt - Epoch ms when queued.
 * @property {number | null} windowId - The approval popup window, once open.
 */

/**
 * @param {Object} options
 * @param {number} options.timeoutMs - How long an entry may wait.
 * @param {() => string} [options.generateId] - UUID source.
 * @param {() => number} [options.now] - Clock.
 */
export function createApprovalQueue({
  timeoutMs,
  generateId = () => crypto.randomUUID(),
  now = Date.now,
}) {
  /** @type {Map<string, ApprovalEntry>} */
  const entries = new Map();

  const isExpired = (entry) => now() - entry.createdAt >= timeoutMs;

  return {
    /**
     * @param {Omit<ApprovalEntry, "id" | "createdAt" | "windowId">} pending
     * @returns {ApprovalEntry} The stored entry.
     */
    add(pending) {
      const entry = {
        ...pending,
        id: generateId(),
        createdAt: now(),
        windowId: null,
      };
      entries.set(entry.id, entry);
      return entry;
    },

    /**
     * @param {string} id
     * @returns {ApprovalEntry | null} The live entry, without removing it.
     */
    peek(id) {
      const entry = entries.get(id);
      return entry && !isExpired(entry) ? entry : null;
    },

    /**
     * Removes and returns an entry; a second call for the same id gets null.
     * @param {string} id
     * @returns {ApprovalEntry | null}
     */
    take(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      entries.delete(id);
      return isExpired(entry) ? null : entry;
    },

    /**
     * @param {string} id
     * @param {number} windowId
     */
    attachWindow(id, windowId) {
      const entry = entries.get(id);
      if (entry) entry.windowId = windowId;
    },

    /**
     * @param {string} origin
     * @param {string} method
     * @returns {boolean} True when that origin already has a live request for the method.
     */
    hasPending(origin, method) {
      for (const entry of entries.values()) {
        if (entry.origin === origin && entry.method === method) {
          if (!isExpired(entry)) return true;
        }
      }
      return false;
    },

    /**
     * Removes every entry of a closed tab.
     * @param {number} tabId
     * @returns {ApprovalEntry[]} The removed entries.
     */
    removeByTab(tabId) {
      return removeWhere((entry) => entry.tabId === tabId);
    },

    /**
     * Removes the entry whose approval window was closed without an answer.
     * @param {number} windowId
     * @returns {ApprovalEntry[]} The removed entries.
     */
    removeByWindow(windowId) {
      return removeWhere((entry) => entry.windowId === windowId);
    },

    /**
     * Removes every entry that waited longer than timeoutMs.
     * @returns {ApprovalEntry[]} The removed entries.
     */
    removeExpired() {
      return removeWhere(isExpired);
    },

    get size() {
      return entries.size;
    },
  };

  function removeWhere(predicate) {
    const removed = [];
    for (const [id, entry] of entries) {
      if (predicate(entry)) {
        entries.delete(id);
        removed.push(entry);
      }
    }
    return removed;
  }
}
