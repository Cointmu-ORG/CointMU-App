import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const namespaces = [
  "common",
  "wallet",
  "walletTabs",
  "settings",
  "dashboard",
  "mining",
  "explorer",
  "auth",
  "ui",
];

const savedLanguage = localStorage.getItem("appLanguage") || "en";

const customBackend = {
  type: "backend" as const,
  read: (
    language: string,
    namespace: string,
    callback: (errorValue: unknown, translations: unknown) => void,
  ) => {
    import(`../locales/${language}/${namespace}.json`)
      .then((resources) => {
        callback(null, resources.default || resources);
      })
      .catch((error) => {
        callback(error, null);
      });
  },
};

void i18n
  .use(customBackend)
  .use(initReactI18next)
  .init({
    lng: savedLanguage,
    fallbackLng: "en",
    ns: namespaces,
    defaultNS: "common",
    fallbackNS: "common",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
  });

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("appLanguage", lng);
});

export default i18n;
