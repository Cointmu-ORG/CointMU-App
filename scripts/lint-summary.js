const fs = require("fs");

const ARG_POSITION_OXLINT_REPORT = 2;
const ARG_POSITION_STEIGER_REPORT = 3;

/**
 * Counts how often each rule appears in a list of rule names.
 * @param {string[]} ruleNames - One entry per violation.
 * @returns {[string, number][]} Rule/count pairs, most frequent first.
 */
function countByRule(ruleNames) {
  const counts = new Map();
  ruleNames.forEach((rule) => counts.set(rule, (counts.get(rule) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/**
 * Renders one linter's violations as a Markdown section.
 * @param {string} title - Section heading.
 * @param {string} reportPath - Path to the linter's JSON report.
 * @param {(report: unknown) => string[]} extractRules - Maps a report to rule names.
 * @returns {string} Markdown section.
 */
function renderSection(title, reportPath, extractRules) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (err) {
    return `### ${title}\n\nNo readable report at \`${reportPath}\`: ${err.message}`;
  }

  const rows = countByRule(extractRules(report));
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  const lines = [`### ${title}: ${total} violations`, ""];
  if (rows.length === 0) return lines.join("\n");

  lines.push("| Rule | Count |", "| --- | --- |");
  rows.forEach(([rule, count]) => lines.push(`| \`${rule}\` | ${count} |`));
  return lines.join("\n");
}

const sections = [
  renderSection("oxlint", process.argv[ARG_POSITION_OXLINT_REPORT], (report) =>
    report.diagnostics.map((diagnostic) => diagnostic.code),
  ),
  renderSection(
    "steiger (FSD)",
    process.argv[ARG_POSITION_STEIGER_REPORT],
    (report) => report.map((diagnostic) => diagnostic.ruleName),
  ),
];
console.log(["## Lint (non-blocking)", ...sections].join("\n\n"));
