import { describe, expect, it } from "vitest";
import i18next from "i18next";
import de from "../../../locales/de/settings.json";
import en from "../../../locales/en/settings.json";
import es from "../../../locales/es/settings.json";
import id from "../../../locales/id/settings.json";
import ja from "../../../locales/ja/settings.json";
import ru from "../../../locales/ru/settings.json";
import zh from "../../../locales/zh/settings.json";

const SETTINGS = { de, en, es, id, ja, ru, zh };
const KEY = "settings:networkSettings.connectedPeersDesc";
const COUNTS = [0, 1, 2, 5, 21];

async function translator(lang: string, settings: object) {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: lang, resources: { [lang]: { settings } } });
  return i18n.t;
}

describe("connected peers description", () => {
  it.each(Object.entries(SETTINGS))(
    "shows the real peer count in %s",
    async (lang, settings) => {
      const t = await translator(lang, settings);

      COUNTS.forEach((count) => {
        expect(t(KEY, { count })).toMatch(new RegExp(`(^|\\D)${count}(\\D|$)`));
      });
    },
  );

  it("picks the English singular and plural", async () => {
    const t = await translator("en", en);

    expect(t(KEY, { count: 0 })).toBe("0 nodes currently gossiping with you");
    expect(t(KEY, { count: 1 })).toBe("1 node currently gossiping with you");
  });

  it("picks every Russian plural form", async () => {
    const t = await translator("ru", ru);

    expect(t(KEY, { count: 0 })).toBe("0 узлов в сети");
    expect(t(KEY, { count: 1 })).toBe("1 узел в сети");
    expect(t(KEY, { count: 2 })).toBe("2 узла в сети");
    expect(t(KEY, { count: 5 })).toBe("5 узлов в сети");
    expect(t(KEY, { count: 21 })).toBe("21 узел в сети");
  });
});
