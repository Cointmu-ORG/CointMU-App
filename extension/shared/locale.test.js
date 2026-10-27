import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTranslations } from "./locale.js";

const LOCALE = {
  extension: { wallet: { send: "Send", deleteWalletBtn: "Delete Wallet" } },
};

/** Stands in for an element with the given data-* attributes. */
function fakeElement(dataset) {
  return { dataset, textContent: "old", title: "old" };
}

function stubPage(elements) {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => LOCALE,
  }));
  vi.stubGlobal("document", {
    querySelectorAll: (selector) =>
      elements.filter((el) =>
        selector === "[data-i18n]"
          ? "i18n" in el.dataset
          : "i18nTitle" in el.dataset,
      ),
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

  it("keeps the markup text for a key en.json lacks", async () => {
    const label = fakeElement({ i18n: "extension.wallet.nope" });
    stubPage([label]);

    await loadTranslations();

    expect(label.textContent).toBe("old");
  });
});
