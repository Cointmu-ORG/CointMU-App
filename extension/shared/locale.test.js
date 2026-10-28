import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMessage, loadTranslations, pickLanguage } from "./locale.js";

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

/**
 * Stubs the popup page. `locales` maps a language to its file content, or to
 * null for a file that fails to load; `uiLanguage` is the browser language.
 */
function stubPage(elements, { locales = { en: LOCALE }, uiLanguage } = {}) {
  vi.stubGlobal("fetch", async (url) => {
    const language = url.match(/locales\/(\w+)\.json$/)[1];
    const content = locales[language];
    return { ok: Boolean(content), json: async () => content };
  });
  const documentElement = { lang: "" };
  vi.stubGlobal("document", {
    documentElement,
    querySelectorAll: (selector) =>
      elements.filter((el) => DATASET_KEYS[selector] in el.dataset),
  });
  vi.stubGlobal("chrome", { i18n: { getUILanguage: () => uiLanguage } });
  return documentElement;
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

describe("loadTranslations language", () => {
  afterEach(() => vi.unstubAllGlobals());

  const JA = { extension: { wallet: { send: "送信" } } };

  it("uses the browser language and fills its gaps from English", async () => {
    const send = fakeElement({ i18n: "extension.wallet.send" });
    const del = fakeElement({ i18nTitle: "extension.wallet.deleteWalletBtn" });
    const root = stubPage([send, del], {
      locales: { en: LOCALE, ja: JA },
      uiLanguage: "ja",
    });

    await loadTranslations();

    expect(send.textContent).toBe("送信");
    expect(del.title).toBe("Delete Wallet");
    expect(root.lang).toBe("ja");
  });

  it("falls back to English when the language file fails to load", async () => {
    const send = fakeElement({ i18n: "extension.wallet.send" });
    const root = stubPage([send], {
      locales: { en: LOCALE, ja: null },
      uiLanguage: "ja-JP",
    });

    await loadTranslations();

    expect(send.textContent).toBe("Send");
    expect(root.lang).toBe("en");
  });
});

describe("pickLanguage", () => {
  it.each([
    ["ja", "ja"],
    ["zh-CN", "zh"],
    ["zh_TW", "zh"],
    ["pt-BR", "en"],
    ["DE", "de"],
    ["", "en"],
    [undefined, "en"],
  ])("maps %j to %j", (uiLanguage, language) => {
    expect(pickLanguage(uiLanguage)).toBe(language);
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
