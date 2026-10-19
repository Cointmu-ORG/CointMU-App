const fs = require("fs");

const ARG_POSITION_REPORT = 2;
const SEVERITIES = ["critical", "high", "moderate", "low", "info"];
const LISTED_SEVERITIES = ["critical", "high"];

/**
 * Renders an `npm audit --json` report as a Markdown job summary:
 * counts per severity, then every critical/high package.
 * @param {Object} report - Parsed npm audit JSON report.
 * @returns {string} Markdown summary.
 */
function renderSummary(report) {
  const counts = report.metadata.vulnerabilities;
  const lines = ["## npm audit", "", "| Severity | Count |", "| --- | --- |"];
  SEVERITIES.forEach((severity) =>
    lines.push(`| ${severity} | ${counts[severity]} |`),
  );

  const listed = Object.values(report.vulnerabilities).filter((vuln) =>
    LISTED_SEVERITIES.includes(vuln.severity),
  );
  if (listed.length > 0) {
    lines.push("", "| Package | Severity | Direct | Fix available |");
    lines.push("| --- | --- | --- | --- |");
    listed.forEach((vuln) =>
      lines.push(
        `| ${vuln.name} | ${vuln.severity} | ${vuln.isDirect} | ${Boolean(vuln.fixAvailable)} |`,
      ),
    );
  }

  return lines.join("\n");
}

const reportPath = process.argv[ARG_POSITION_REPORT];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
console.log(renderSummary(report));
