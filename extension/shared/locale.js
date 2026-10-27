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

/**
 * Loads the English translation JSON file and flattens it for UI consumption.
 * Sets the text of every `[data-i18n]` element, the title of every
 * `[data-i18n-title]` element and the placeholder of every
 * `[data-i18n-placeholder]` element whose key exists.
 * @returns {Promise<Object>} The flattened translations object.
 */
export async function loadTranslations() {
  try {
    const response = await fetch("../locales/en.json");
    if (!response.ok) throw new Error("Failed to load translations");
    const json = await response.json();
    const translations = flattenObject(json);

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
