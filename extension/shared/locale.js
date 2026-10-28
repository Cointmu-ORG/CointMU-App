"use strict";

/**
 * Flattens a nested object into a single level object with dot-notation keys.
 * @param {Object} obj - The object to flatten.
 * @param {string} [prefix=''] - The prefix for the current level.
 * @returns {Object} The flattened object.
 */
export function flattenObject(obj, prefix = "") {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + "." : "";
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

/** Languages with a file in ../locales; the desktop app ships the same seven. */
export const SUPPORTED_LANGUAGES = ["en", "id", "es", "de", "ru", "ja", "zh"];
const FALLBACK_LANGUAGE = "en";

/**
 * Maps a browser UI language ("pt-BR", "zh_CN", "ja") to a supported one.
 * @param {string | undefined} uiLanguage - From chrome.i18n.getUILanguage().
 * @returns {string} A supported language code, "en" when there is no match.
 */
export function pickLanguage(uiLanguage) {
  const base = String(uiLanguage ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * @param {string} language - A supported language code.
 * @returns {Promise<Object>} The flattened locale file.
 */
async function fetchLocale(language) {
  const response = await fetch(`../locales/${language}.json`);
  if (!response.ok) throw new Error(`Failed to load ${language} translations`);
  return flattenObject(await response.json());
}

/**
 * Loads the translations for the browser's UI language, with English filling
 * any key the language lacks (or all of them if its file fails to load).
 * Sets the text of every `[data-i18n]` element, the title of every
 * `[data-i18n-title]` element and the placeholder of every
 * `[data-i18n-placeholder]` element whose key exists.
 * @returns {Promise<Object>} The flattened translations object.
 */
export async function loadTranslations() {
  try {
    let language = pickLanguage(globalThis.chrome?.i18n?.getUILanguage?.());
    const translations = await fetchLocale(FALLBACK_LANGUAGE);
    if (language !== FALLBACK_LANGUAGE) {
      try {
        Object.assign(translations, await fetchLocale(language));
      } catch (err) {
        console.error("Falling back to English translations:", err);
        language = FALLBACK_LANGUAGE;
      }
    }
    document.documentElement.lang = language;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const text = translations[el.dataset.i18n];
      if (text) el.textContent = text;
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const text = translations[el.dataset.i18nTitle];
      if (text) el.title = text;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const text = translations[el.dataset.i18nPlaceholder];
      if (text) el.placeholder = text;
    });
    return translations;
  } catch (err) {
    console.error("Error loading translations:", err);
    return {};
  }
}

/**
 * Fills `{{name}}` placeholders in a translated message, i18next style, so a
 * locale can move the value anywhere in the sentence.
 * @param {string} template - The translated message.
 * @param {Object<string, string>} values - Placeholder values by name.
 * @returns {string} The message with every known placeholder replaced.
 */
export function formatMessage(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    name in values ? String(values[name]) : match,
  );
}
