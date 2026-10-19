"use strict";

// shared/protocol.js runs first (see manifest content_scripts) and defines this.
const { MessageSource, PageEvent, RuntimeMessage, ErrorCode } =
  globalThis.CointMUProtocol;

const PAGE_ORIGIN = window.location.origin;
// Opaque pages (sandboxed, about:blank, file:) cannot be targeted by origin,
// so nothing is relayed or posted there; the provider rejects requests itself.
const IS_OPAQUE_PAGE = globalThis.CointMUProtocol.isOpaqueOrigin(
  PAGE_ORIGIN,
  window.location.protocol,
);
const CONTEXT_INVALIDATED = "Extension context invalidated";

/**
 * Injects the injected.js provider script into the page's MAIN world by
 * appending a <script> tag to document.head or document.documentElement.
 * The src is resolved via chrome.runtime.getURL so the file is loaded from
 * the extension bundle and is trusted by the browser. The element is removed
 * from the DOM immediately after it loads to keep the page tree clean.
 * @returns {void}
 */
function injectProvider() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("content/injected.js");
  script.type = "text/javascript";

  script.addEventListener("load", function () {
    script.remove();
  });

  (document.head || document.documentElement).appendChild(script);
}

/**
 * Posts a message to the provider in this window only. The target origin is
 * the page's own origin, never "*", so nothing reaches another document even
 * if the window navigates before delivery.
 * @param {Object} message - The payload; the content source tag is added.
 * @returns {void}
 */
function postToPage(message) {
  if (IS_OPAQUE_PAGE) return;
  window.postMessage(
    { ...message, source: MessageSource.CONTENT },
    PAGE_ORIGIN,
  );
}

/**
 * @param {number} id - The provider request id.
 * @param {{ code?: number, message?: string }} error - The error to report.
 * @returns {void}
 */
function postError(id, error) {
  postToPage({
    id,
    error: {
      code: error.code ?? ErrorCode.INTERNAL_ERROR,
      message: error.message || "Unknown extension error",
    },
  });
}

/**
 * Relays a JSON-RPC request from the page provider to the background service
 * worker and posts the answer back. Only messages this window posted to
 * itself are accepted, so other frames cannot inject requests. The origin is
 * not sent: the background takes it from the browser-reported sender.
 * @param {MessageEvent} event - The message event posted by the provider.
 * @returns {void}
 */
function handlePageMessage(event) {
  if (
    !globalThis.CointMUProtocol.isTrustedPageMessage(
      event,
      window,
      MessageSource.PAGE,
    )
  ) {
    return;
  }

  const { id, method, params } = event.data;

  try {
    chrome.runtime.sendMessage({ id, method, params }, function (response) {
      if (chrome.runtime.lastError) {
        postError(id, {
          message: chrome.runtime.lastError.message || "Extension relay error",
        });
        return;
      }
      postToPage({
        id,
        result: response.result,
        error: response.error || null,
      });
    });
  } catch (err) {
    postError(id, {
      message: err.message?.includes(CONTEXT_INVALIDATED)
        ? "Extension context invalidated. Please refresh the page."
        : err.message,
    });
  }
}

/**
 * Forwards account events from the background to the page provider.
 * @param {{ type?: string, accounts?: string[] }} message - The runtime message.
 * @param {chrome.runtime.MessageSender} sender - The sender.
 * @returns {void}
 */
function handleRuntimeMessage(message, sender) {
  if (sender.id !== chrome.runtime.id || !message) return;
  if (message.type === RuntimeMessage.REVOKE_SITE) {
    postToPage({ type: PageEvent.REVOKE_SITE });
  } else if (message.type === RuntimeMessage.ACCOUNTS_CHANGED) {
    postToPage({
      type: PageEvent.ACCOUNTS_CHANGED,
      accounts: message.accounts,
    });
  }
}

injectProvider();

if (!IS_OPAQUE_PAGE) {
  window.addEventListener("message", handlePageMessage);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}
