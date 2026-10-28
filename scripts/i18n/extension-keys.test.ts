import { describe, expect, it } from "vitest";
import {
  findExtensionKeyGaps,
  findExtensionLocaleGaps,
} from "./extension-keys";

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

describe("findExtensionLocaleGaps", () => {
  const EN = {
    extension: {
      wallet: {
        send: "Send",
        sent: "Sent {{hash}}",
        failed: "Failed: {{reason}}",
      },
    },
  };

  it("accepts a complete translation", () => {
    const ja = {
      extension: {
        wallet: {
          send: "送信",
          sent: "{{hash}} を送信",
          failed: "失敗：{{reason}}",
        },
      },
    };

    expect(findExtensionLocaleGaps(EN, ja)).toEqual({
      missing: [],
      extra: [],
      placeholderMismatch: [],
    });
  });

  it("reports missing and extra keys and renamed or dropped placeholders", () => {
    const de = {
      extension: {
        wallet: {
          sent: "Gesendet {{hesh}}",
          failed: "Fehlgeschlagen",
          old: "Alt",
        },
      },
    };

    expect(findExtensionLocaleGaps(EN, de)).toEqual({
      missing: ["extension.wallet.send"],
      extra: ["extension.wallet.old"],
      placeholderMismatch: ["extension.wallet.failed", "extension.wallet.sent"],
    });
  });
});
