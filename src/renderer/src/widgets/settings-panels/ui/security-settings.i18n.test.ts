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
const DEVICES = ["Ledger", "Trezor"];

describe("hardware wallet row description", () => {
  it.each(Object.entries(SETTINGS))(
    "names the device each row passes in %s",
    async (lang, settings) => {
      const i18n = i18next.createInstance();
      await i18n.init({ lng: lang, resources: { [lang]: { settings } } });

      DEVICES.forEach((device) => {
        const text = i18n.t("settings:securitySettings.hardwareDesc", {
          device,
        });
        expect(text).toContain(device);
        DEVICES.filter((other) => other !== device).forEach((other) =>
          expect(text).not.toContain(other),
        );
      });
    },
  );
});
