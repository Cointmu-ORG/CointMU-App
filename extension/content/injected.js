"use strict";

(function () {
  // Kept in sync with extension/shared/protocol.js. This script runs in the
  // page's world, so it cannot share the content script's global.
  const PROVIDER_MESSAGE_SOURCE = "cointmu-injected";
  const PAGE_MESSAGE_SOURCE = "cointmu-page";
  const PageEvent = {
    ACCOUNTS_CHANGED: "COINTMU_ACCOUNTS_CHANGED",
    REVOKE_SITE: "COINTMU_REVOKE_SITE",
  };
  const UNAUTHORIZED_CODE = 4100;
  const INTERNAL_ERROR_CODE = -32603;
  const OPAQUE_ORIGIN = "null";
  const FILE_PROTOCOL = "file:";

  const PAGE_ORIGIN = window.location.origin;
  const IS_OPAQUE_PAGE =
    PAGE_ORIGIN === OPAQUE_ORIGIN || window.location.protocol === FILE_PROTOCOL;

  let nextRequestId = 1;

  /**
   * Holds the resolver and rejecter for a pending JSON-RPC request so that the
   * response routed back from the Electron app can settle the correct Promise.
   * @typedef {Object} PendingEntry
   * @property {Function} resolve - Settles the promise with the RPC result.
   * @property {Function} reject  - Rejects the promise with an error object.
   */

  /** @type {Map<number, {resolve: Function, reject: Function}>} */
  const pending = new Map();

  /**
   * Builds an EIP-1193 provider error: an Error carrying a numeric code.
   * @param {{ code?: number, message?: string, data?: unknown }} error
   * @returns {Error & { code: number, data?: unknown }}
   */
  function providerError(error) {
    const err = new Error(error.message || "RPC error");
    err.code =
      typeof error.code === "number" ? error.code : INTERNAL_ERROR_CODE;
    if (error.data !== undefined) err.data = error.data;
    return err;
  }

  /**
   * Accepts only messages the content script posted to this same window, so
   * other frames cannot settle requests or fake account events.
   * @param {MessageEvent} event
   * @returns {boolean}
   */
  function isFromContentScript(event) {
    return (
      event.source === window &&
      event.origin === PAGE_ORIGIN &&
      typeof event.data === "object" &&
      event.data !== null &&
      event.data.source === PROVIDER_MESSAGE_SOURCE
    );
  }

  /**
   * Handles incoming messages from the content script layer. Account events
   * update the provider; responses settle the matching pending request.
   * @param {MessageEvent} event - The message event dispatched on the window.
   * @returns {void}
   */
  function handleResponse(event) {
    if (!isFromContentScript(event)) return;

    if (event.data.type === PageEvent.REVOKE_SITE) {
      provider.selectedAddress = null;
      provider.emit("accountsChanged", []);
      return;
    }

    if (event.data.type === PageEvent.ACCOUNTS_CHANGED) {
      const accounts = Array.isArray(event.data.accounts)
        ? event.data.accounts
        : [];
      provider.selectedAddress = accounts[0] || null;
      provider.emit("accountsChanged", accounts);
      return;
    }

    const { id, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) {
      entry.reject(providerError(error));
    } else {
      entry.resolve(result);
    }
  }

  window.addEventListener("message", handleResponse);

  /**
   * The EIP-1193 compliant provider object injected into window.ethereum.
   * All dApp calls are forwarded to the CointMU desktop wallet via postMessage
   * to the content script, which relays them over the background WebSocket.
   * No private keys or account state are held in this object.
   */
  const provider = {
    isMetaMask: false,
    isCointMU: true,
    chainId: null,
    selectedAddress: null,

    /**
     * Forwards a JSON-RPC request to the content script and returns a promise
     * that resolves or rejects once the wallet responds. On opaque pages
     * (sandboxed frames, about:blank, file:) the request is rejected here and
     * nothing is posted.
     * @param {{ method: string, params?: unknown[] }} args - The JSON-RPC request arguments.
     * @returns {Promise<unknown>} A promise resolving to the JSON-RPC result.
     */
    request(args) {
      return new Promise(function (resolve, reject) {
        if (IS_OPAQUE_PAGE) {
          reject(
            providerError({
              code: UNAUTHORIZED_CODE,
              message:
                "CointMU is not available on sandboxed, about:blank or file: pages.",
            }),
          );
          return;
        }
        const id = nextRequestId++;
        pending.set(id, { resolve, reject });
        window.postMessage(
          {
            source: PAGE_MESSAGE_SOURCE,
            id,
            method: args.method,
            params: args.params || [],
          },
          PAGE_ORIGIN,
        );
      });
    },

    /**
     * Legacy send interface maintained for compatibility with older dApps.
     * Delegates to the request method using the standard EIP-1193 shape.
     * @param {string} method - The JSON-RPC method name.
     * @param {unknown[]} params - The positional parameters for the method.
     * @returns {Promise<unknown>} A promise resolving to the JSON-RPC result.
     */
    send(method, params) {
      return this.request({ method, params });
    },

    /**
     * Legacy sendAsync interface maintained for compatibility with older dApps.
     * Delegates to the request method and adapts the result into a callback pattern.
     * @param {{ method: string, params: unknown[], id: number }} payload - The JSON-RPC request payload.
     * @param {Function} callback - Node-style callback receiving (error, response).
     * @returns {void}
     */
    sendAsync(payload, callback) {
      this.request({ method: payload.method, params: payload.params })
        .then(function (result) {
          callback(null, { id: payload.id, jsonrpc: "2.0", result });
        })
        .catch(function (err) {
          callback(err, null);
        });
    },

    /** @type {Record<string, Function[]>} */
    _listeners: {},

    /**
     * @param {string} eventName - The event name to subscribe to.
     * @param {Function} listener - The listener function.
     * @returns {typeof provider} The provider object for chaining.
     */
    on(eventName, listener) {
      if (!this._listeners[eventName]) {
        this._listeners[eventName] = [];
      }
      this._listeners[eventName].push(listener);
      return this;
    },

    /**
     * @param {string} eventName - The event name to unsubscribe from.
     * @param {Function} listener - The listener to remove.
     * @returns {typeof provider} The provider object for chaining.
     */
    removeListener(eventName, listener) {
      if (this._listeners[eventName]) {
        this._listeners[eventName] = this._listeners[eventName].filter(
          function (l) {
            return l !== listener;
          },
        );
      }
      return this;
    },

    /**
     * @param {string} eventName - The event to emit.
     * @param {unknown} payload - The event payload.
     * @returns {void}
     */
    emit(eventName, payload) {
      if (this._listeners[eventName]) {
        this._listeners[eventName].forEach(function (listener) {
          try {
            listener(payload);
          } catch (e) {
            console.error("Error in event listener", e);
          }
        });
      }
    },
  };

  Object.defineProperty(window, "ethereum", {
    value: provider,
    writable: false,
    configurable: false,
  });

  window.dispatchEvent(new Event("ethereum#initialized"));
})();
