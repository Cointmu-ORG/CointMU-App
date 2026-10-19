"use strict";

/**
 * Message protocol shared by the background service worker and the content
 * script. Written as a classic script that publishes one frozen global so it
 * also loads as a content script, where ES module imports are unavailable.
 * The content-script copy lives in the isolated world, so pages never see it.
 * The MAIN-world provider (content/injected.js) keeps its own copy on purpose.
 */

const OPAQUE_ORIGIN = "null";
const FILE_PROTOCOL = "file:";

globalThis.CointMUProtocol = Object.freeze({
  /** JSON-RPC methods that sign on behalf of the user. */
  SIGNING_METHODS: Object.freeze([
    "personal_sign",
    "eth_sign",
    "eth_signTypedData",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_sendTransaction",
    "eth_signTransaction",
  ]),
  CONNECT_METHOD: "eth_requestAccounts",
  ACCOUNTS_METHOD: "eth_accounts",
  /** EIP-1193 and JSON-RPC error codes used in responses to dApps. */
  ErrorCode: Object.freeze({
    USER_REJECTED: 4001,
    UNAUTHORIZED: 4100,
    UNSUPPORTED_METHOD: 4200,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    REQUEST_PENDING: -32002,
  }),
  /** `source` tags on window.postMessage between the page and content script. */
  MessageSource: Object.freeze({
    PAGE: "cointmu-page",
    CONTENT: "cointmu-injected",
  }),
  /** Event types the content script posts to the page provider. */
  PageEvent: Object.freeze({
    ACCOUNTS_CHANGED: "COINTMU_ACCOUNTS_CHANGED",
    REVOKE_SITE: "COINTMU_REVOKE_SITE",
  }),
  /** Message types the background sends to content scripts. */
  RuntimeMessage: Object.freeze({
    ACCOUNTS_CHANGED: "ACCOUNTS_CHANGED",
    REVOKE_SITE: "REVOKE_SITE",
  }),

  /**
   * @param {string} origin - window.location.origin.
   * @param {string} protocol - window.location.protocol.
   * @returns {boolean} True for an origin that cannot be targeted or trusted
   * (sandboxed or about:blank pages report "null"; file: pages are opaque).
   */
  isOpaqueOrigin(origin, protocol) {
    return origin === OPAQUE_ORIGIN || protocol === FILE_PROTOCOL;
  },

  /**
   * Accepts only messages that this same window posted to itself, so another
   * frame or window cannot inject requests or fake provider events.
   * @param {MessageEvent} event - The message event.
   * @param {Window} win - The receiving window.
   * @param {string} expectedSource - The required data.source tag.
   * @returns {boolean} True when the message can be trusted.
   */
  isTrustedPageMessage(event, win, expectedSource) {
    return (
      event.source === win &&
      event.origin === win.location.origin &&
      typeof event.data === "object" &&
      event.data !== null &&
      event.data.source === expectedSource
    );
  },
});
