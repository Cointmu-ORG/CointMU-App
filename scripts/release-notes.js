const { execFileSync } = require("child_process");

const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";
const TAG_GLOB = "v*";
const RELEASE_COMMIT_PATTERN = /^chore: release version /;
const CONVENTIONAL_COMMIT_PATTERN = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const SQUASHED_PR_PATTERN = /\s\(#(\d+)\)$/;
const MERGED_PR_PATTERN = /^Merge pull request #(\d+) /;
const DEPENDABOT_AUTHOR_PATTERN = /dependabot\[bot\]/;
const GITHUB_REMOTE_PATTERN = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/;
const MAINTENANCE_TITLE = "🔧 Maintenance";
const CATEGORIES = [
  { title: "✨ Features", types: ["feat"] },
  { title: "🐛 Fixes", types: ["fix"] },
  { title: "⚡ Performance", types: ["perf"] },
];
const EXIT_CODE_USAGE = 2;

/**
 * Turns one raw commit into a release-note entry.
 * @param {{hash: string, shortHash: string, author: string, subject: string}} commit
 * @param {Map<string, string>} mergedPrByHash - PR number per commit hash, from merge commits.
 * @returns {Object} Entry with type, scope, breaking, description, pr, shortHash, isDependabot.
 */
function parseCommit(commit, mergedPrByHash) {
  const squashedPr = commit.subject.match(SQUASHED_PR_PATTERN);
  const subject = commit.subject.replace(SQUASHED_PR_PATTERN, "");
  const conventional = subject.match(CONVENTIONAL_COMMIT_PATTERN);
  return {
    type: conventional ? conventional[1].toLowerCase() : null,
    scope: conventional ? conventional[2] || null : null,
    breaking: Boolean(conventional && conventional[3]),
    description: conventional ? conventional[4] : subject,
    pr: squashedPr ? squashedPr[1] : mergedPrByHash.get(commit.hash) || null,
    shortHash: commit.shortHash,
    isDependabot: DEPENDABOT_AUTHOR_PATTERN.test(commit.author),
  };
}

/**
 * Formats one entry as a Markdown bullet.
 * @param {Object} entry - Entry from parseCommit.
 * @returns {string} Bullet line.
 */
function formatBullet(entry) {
  const breaking = entry.breaking ? "⚠️ **BREAKING** " : "";
  const scope = entry.scope ? `**${entry.scope}:** ` : "";
  const pr = entry.pr ? ` (#${entry.pr})` : "";
  return `- ${breaking}${scope}${entry.description}${pr} ${entry.shortHash}`;
}

/**
 * Formats all Dependabot entries as a single summary bullet.
 * @param {Object[]} entries - Dependabot entries.
 * @returns {string} Bullet line.
 */
function formatDependabotBullet(entries) {
  const prs = [...new Set(entries.map((entry) => entry.pr).filter(Boolean))];
  const refs =
    prs.length > 0 ? ` (${prs.map((pr) => `#${pr}`).join(", ")})` : "";
  const count = entries.length === 1 ? "1 update" : `${entries.length} updates`;
  return `- Dependency updates by Dependabot: ${count}${refs}`;
}

/**
 * Groups entries into the release-note sections, dropping empty ones.
 * Unknown or non-conventional types count as maintenance.
 * @param {Object[]} entries - Entries from parseCommit, oldest first.
 * @returns {{title: string, bullets: string[]}[]} Non-empty sections in display order.
 */
function groupEntries(entries) {
  const dependabot = entries.filter((entry) => entry.isDependabot);
  const own = entries.filter((entry) => !entry.isDependabot);
  const sections = CATEGORIES.map(({ title, types }) => ({
    title,
    bullets: own
      .filter((entry) => types.includes(entry.type))
      .map(formatBullet),
  }));

  const categorized = CATEGORIES.flatMap(({ types }) => types);
  const maintenance = own
    .filter((entry) => !categorized.includes(entry.type))
    .map(formatBullet);
  if (dependabot.length > 0)
    maintenance.push(formatDependabotBullet(dependabot));
  sections.push({ title: MAINTENANCE_TITLE, bullets: maintenance });

  return sections.filter((section) => section.bullets.length > 0);
}

/**
 * Renders the release body.
 * @param {{version: string, codename: string, repository: string, previousTag: string|null, tag: string, entries: Object[]}} release
 * @returns {string} Markdown body.
 */
function renderNotes(release) {
  const lines = [`## CointMU v${release.version} "${release.codename}"`, ""];
  groupEntries(release.entries).forEach(({ title, bullets }) => {
    lines.push(`### ${title}`, "", ...bullets, "");
  });

  const base = `https://github.com/${release.repository}`;
  const changelogUrl = release.previousTag
    ? `${base}/compare/${release.previousTag}...${release.tag}`
    : `${base}/commits/${release.tag}`;
  lines.push(`**Full changelog:** ${changelogUrl}`);
  return lines.join("\n");
}

/**
 * Runs git with the given arguments (no shell) and returns trimmed stdout.
 * @param {string[]} args - git arguments.
 * @returns {string} stdout.
 */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * Splits git log output written with the field/record separators.
 * @param {string} output - Raw git log output.
 * @returns {string[][]} Fields per record.
 */
function splitRecords(output) {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => record.split(FIELD_SEPARATOR));
}

/**
 * Maps every commit brought in by a "Merge pull request #N" commit to N.
 * @param {string} range - git revision range.
 * @returns {Map<string, string>} PR number per commit hash.
 */
function readMergedPrByHash(range) {
  const merges = splitRecords(
    git([
      "log",
      "--merges",
      `--format=%H${FIELD_SEPARATOR}%s${RECORD_SEPARATOR}`,
      range,
    ]),
  );
  const prByHash = new Map();
  merges.forEach(([hash, subject]) => {
    const match = subject.match(MERGED_PR_PATTERN);
    if (!match) return;
    git(["rev-list", `${hash}^1..${hash}^2`])
      .split("\n")
      .filter(Boolean)
      .forEach((commitHash) => prByHash.set(commitHash, match[1]));
  });
  return prByHash;
}

/**
 * Reads the non-merge commits of a range, oldest first, without release commits.
 * @param {string} range - git revision range.
 * @returns {{hash: string, shortHash: string, author: string, subject: string}[]}
 */
function readCommits(range) {
  const format = ["%H", "%h", "%an <%ae>", "%s"].join(FIELD_SEPARATOR);
  return splitRecords(
    git([
      "log",
      "--no-merges",
      "--reverse",
      `--format=${format}${RECORD_SEPARATOR}`,
      range,
    ]),
  )
    .map(([hash, shortHash, author, subject]) => ({
      hash,
      shortHash,
      author,
      subject,
    }))
    .filter((commit) => !RELEASE_COMMIT_PATTERN.test(commit.subject));
}

/**
 * Finds the closest v* tag before the given tag.
 * @param {string} tag - Current tag.
 * @returns {string|null} Previous tag, or null for the first release.
 */
function findPreviousTag(tag) {
  const tags = git([
    "tag",
    "--list",
    TAG_GLOB,
    "--merged",
    `${tag}^`,
    "--sort=-v:refname",
  ]);
  return tags.split("\n").find(Boolean) || null;
}

/**
 * Resolves "owner/repo" from GITHUB_REPOSITORY or the origin remote.
 * @returns {string} Repository slug.
 */
function resolveRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = git(["remote", "get-url", "origin"]);
  const match = remote.match(GITHUB_REMOTE_PATTERN);
  if (!match) throw new Error(`origin is not a GitHub remote: ${remote}`);
  return match[1];
}

/**
 * CLI: node scripts/release-notes.js [previous-tag] <tag>
 * Prints the release body for <tag>; the previous v* tag is found when omitted.
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    console.error("Usage: node scripts/release-notes.js [previous-tag] <tag>");
    process.exit(EXIT_CODE_USAGE);
  }

  const tag = args[args.length - 1];
  const previousTag = args.length === 2 ? args[0] : findPreviousTag(tag);
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const pkg = JSON.parse(git(["show", `${tag}:package.json`]));
  const mergedPrByHash = readMergedPrByHash(range);

  console.log(
    renderNotes({
      version: pkg.version,
      codename: pkg.codename,
      repository: resolveRepository(),
      previousTag,
      tag,
      entries: readCommits(range).map((commit) =>
        parseCommit(commit, mergedPrByHash),
      ),
    }),
  );
}

if (require.main === module) main();

module.exports = { parseCommit, groupEntries, renderNotes };
