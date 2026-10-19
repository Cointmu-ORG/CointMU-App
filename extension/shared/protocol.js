"use strict";

/**
 * Message protocol constants shared by the background service worker and,
 * later, the content script. Written as a classic script that publishes one
 * frozen global so it also loads where ES module imports are unavailable.
 * The MAIN-world provider keeps its own copy on purpose.
 */
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
  /** EIP-1193 and JSON-RPC error codes used in responses to dApps. */
  ErrorCode: Object.freeze({
    USER_REJECTED: 4001,
    UNAUTHORIZED: 4100,
    UNSUPPORTED_METHOD: 4200,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    REQUEST_PENDING: -32002,
  }),
});
