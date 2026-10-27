import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMessage, loadTranslations } from "./locale.js";

const LOCALE = {
  extension: {
    wallet: {
      send: "Send",
      deleteWalletBtn: "Delete Wallet",
      networkNamePlaceholder: "e.g. My Testnet",
    },
  },
};

const DATASET_KEYS = {
  "[data-i18n]": "i18n",
  "[data-i18n-title]": "i18nTitle",
  "[data-i18n-placeholder]": "i18nPlaceholder",
};

/** Stands in for an element with the given data-* attributes. */
function fakeElement(dataset) {
  return { dataset, textContent: "old", title: "old", placeholder: "old" };
}

function stubPage(elements) {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => LOCALE,
  }));
  vi.stubGlobal("document", {
    querySelectorAll: (selector) =>
      elements.filter((el) => DATASET_KEYS[selector] in el.dataset),
  });
}

describe("loadTranslations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets data-i18n text and data-i18n-title titles", async () => {
    const label = fakeElement({ i18n: "extension.wallet.send" });
    const button = fakeElement({
      i18nTitle: "extension.wallet.deleteWalletBtn",
    });
    stubPage([label, button]);

    const translations = await loadTranslations();

    expect(label.textContent).toBe("Send");
    expect(button.title).toBe("Delete Wallet");
    expect(button.textContent).toBe("old");
    expect(translations["extension.wallet.send"]).toBe("Send");
  });

  it("sets data-i18n-placeholder placeholders", async () => {
    const input = fakeElement({
      i18nPlaceholder: "extension.wallet.networkNamePlaceholder",
    });
    stubPage([input]);

    await loadTranslations();

    expect(input.placeholder).toBe("e.g. My Testnet");
  });

  it("keeps the markup text for a key en.json lacks", async () => {
    const label = fakeElement({ i18n: "extension.wallet.nope" });
    stubPage([label]);

    await loadTranslations();

    expect(label.textContent).toBe("old");
  });
});

describe("formatMessage", () => {
  it("fills named placeholders wherever the locale puts them", () => {
    expect(
      formatMessage("送金失敗：{{reason}}（{{code}}）", {
        reason: "nonce",
        code: 7,
      }),
    ).toBe("送金失敗：nonce（7）");
  });

  it("leaves an unknown placeholder in place", () => {
    expect(formatMessage("Hash: {{hash}}", {})).toBe("Hash: {{hash}}");
  });
});
