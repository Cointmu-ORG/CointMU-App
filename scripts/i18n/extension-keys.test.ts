import { describe, expect, it } from "vitest";
import { findExtensionKeyGaps } from "./extension-keys";

const LOCALE = {
  extension: { wallet: { send: "Send", cancel: "Cancel", unused: "Old" } },
};

describe("findExtensionKeyGaps", () => {
  it("accepts keys referenced from data-i18n attributes and JS literals", () => {
    const html = '<span data-i18n="extension.wallet.send">Send</span>';
    const js = 'translations["extension.wallet.cancel"] || "Cancel"';

    expect(findExtensionKeyGaps([html, js], LOCALE)).toEqual({
      missing: [],
      unused: ["extension.wallet.unused"],
    });
  });

  it("reports a referenced key that en.json lacks", () => {
    const js = "translations['extension.wallet.desktop'] || 'Desktop'";

    expect(findExtensionKeyGaps([js], LOCALE).missing).toEqual([
      "extension.wallet.desktop",
    ]);
  });
});
