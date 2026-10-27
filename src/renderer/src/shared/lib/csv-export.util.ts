import { type ActivityData } from "@/shared/ui";

const CSV_HEADERS = [
  "Type",
  "Title",
  "Detail",
  "Amount (CMU)",
  "Reference",
  "When",
];

/**
 * Escapes a single CSV field by wrapping it in double quotes and doubling any
 * embedded double quotes, guarding against values that contain commas, quotes,
 * or line breaks.
 * @param {string | number | undefined} value - The raw field value to escape.
 * @returns {string} The CSV-safe field string.
 */
function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Triggers a CSV file download for the provided wallet activity history. The
 * columns mirror the activity record shape used across the app, and the call is
 * a no-op when the history is empty.
 * @param {ActivityData[]} history - The array of wallet activity records to export.
 * @param {string} filename - The desired output filename.
 */
export function downloadActivityCsv(
  history: ActivityData[],
  filename: string,
): void {
  if (!history || history.length === 0) return;

  const rows = history.map((item) => [
    item.kind,
    item.title,
    item.subtitle,
    item.amount,
    item.id,
    item.timestampStr,
  ]);

  const csvContent = [CSV_HEADERS, ...rows]
    .map((columns) =>
      columns.map((field) => escapeCsvField(String(field))).join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
