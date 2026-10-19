"use strict";

/**
 * Renders the approval view model built by the background (approval-view.js)
 * into the popup. All values go through textContent.
 */

const NOT_FOUND_KEY = "extension.approval.notFound";

const translate = (translations, key) => translations[key] || key;

function renderRow(translations, row) {
  const item = document.createElement("div");
  item.className = row.isData ? "tx-row tx-row--data" : "tx-row";
  const label = document.createElement("span");
  label.className = "tx-label";
  label.textContent = translate(translations, row.labelKey);
  const value = document.createElement("span");
  value.className = "tx-value";
  value.textContent = row.valueKey
    ? translate(translations, row.valueKey)
    : row.value;
  item.append(label, value);
  return item;
}

/**
 * @param {{ title: HTMLElement, rows: HTMLElement, warning: HTMLElement, approve: HTMLButtonElement }} elements
 * @param {Object<string, string>} translations - Flattened locale strings.
 * @param {{ titleKey: string, rows: Array<Object>, warningKey: string | null } | null} view
 * The request to show, or null when it no longer exists.
 */
export function renderApprovalView(elements, translations, view) {
  if (!view) {
    elements.warning.textContent = translate(translations, NOT_FOUND_KEY);
    elements.warning.classList.remove("hidden");
    elements.approve.disabled = true;
    return;
  }
  elements.title.textContent = translate(translations, view.titleKey);
  elements.rows.replaceChildren(
    ...view.rows.map((row) => renderRow(translations, row)),
  );
  if (view.warningKey) {
    elements.warning.textContent = translate(translations, view.warningKey);
    elements.warning.classList.remove("hidden");
  }
  elements.approve.disabled = false;
}
