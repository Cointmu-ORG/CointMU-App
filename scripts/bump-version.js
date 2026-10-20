/**
 * Releases a new version: preflight checks, `npm version`, push.
 *
 * The bump, commit and tag are npm's own (`npm version` also runs the
 * `preversion` build gate and the `version` hook, scripts/sync-release-files.js,
 * which stamps the codename and the Makefile). This script only
 * adds the guards around them, and undoes a local release if the push fails.
 *
 * @example
 * node scripts/bump-version.js patch my-codename
 * node scripts/bump-version.js preminor my-codename --preid=beta
 * node scripts/bump-version.js 1.4.0 my-codename
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RELEASE_BRANCH = "main";

/**
 * Runs a git command and returns its trimmed stdout.
 * @param {string[]} args - Arguments to pass to git.
 * @returns {string} The trimmed stdout.
 */
function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/**
 * Runs a git command and reports whether it exited zero.
 * @param {string[]} args - Arguments to pass to git.
 * @returns {boolean} True when the command succeeded.
 */
function gitOk(args) {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a command with inherited stdio, throwing if it fails.
 * @param {string} cmd - The command to run.
 * @param {string[]} args - Arguments to pass to the command.
 * @param {Object} [env] - Extra environment variables.
 * @returns {void}
 */
function run(cmd, args, env) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/**
 * Prints a message and exits with a failure code.
 * @param {...string} lines - Lines to print to stderr.
 * @returns {never}
 */
function die(...lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

/**
 * Undoes a release that was committed locally but never pushed.
 *
 * Decides by comparing HEAD against the SHA captured before the release began:
 * a failure that happened before any commit was created must leave git
 * untouched, and a commit the remote already accepted must not be reset.
 *
 * @param {string} reason - What failed, printed first.
 * @param {string} preRunHead - HEAD as it was before `npm version` ran.
 * @returns {never}
 */
function rollback(reason, preRunHead) {
  const now = git(["rev-parse", "HEAD"]);

  console.error(`\n${reason}`);

  if (now === preRunHead) {
    die(`HEAD unchanged (${now}) - nothing to roll back.`);
  }

  if (gitOk(["merge-base", "--is-ancestor", now, `origin/${RELEASE_BRANCH}`])) {
    die(
      `commit ${now} is already on origin/${RELEASE_BRANCH} - NOT resetting.`,
      "The release landed remotely; reconcile manually before retrying.",
    );
  }

  for (const tag of git(["tag", "--points-at", now])
    .split("\n")
    .filter(Boolean)) {
    git(["tag", "-d", tag]);
  }
  git(["reset", "--hard", preRunHead]);

  die(
    `rolled back: HEAD ${now} -> ${git(["rev-parse", "HEAD"])}`,
    `             (expected ${preRunHead})`,
  );
}

/**
 * Main execution flow for the release script.
 * @returns {void}
 */
function main() {
  const [bumpType, codename, ...passthrough] = process.argv.slice(2);

  if (!bumpType || !codename) {
    die(
      "Usage: node scripts/bump-version.js <bump-type> <codename> [npm-version-flags]",
      "  bump-type: major | minor | patch | premajor | preminor | prepatch |",
      "             prerelease | an explicit version such as 1.4.0",
      "  example:   node scripts/bump-version.js preminor my-codename --preid=beta",
    );
  }

  // The old script took a prerelease tag as a third positional; npm takes
  // --preid instead, so catch the muscle-memory form rather than forwarding it.
  const stray = passthrough.find((arg) => !arg.startsWith("-"));
  if (stray) {
    die(
      `Unexpected argument ${JSON.stringify(stray)}.`,
      "Prereleases no longer take a third positional. Use an npm prerelease",
      `bump instead, e.g.: prepatch ${codename} --preid=${stray.replace(/\..*$/, "")}`,
    );
  }

  // The codename is interpolated into npm's -m, where %s expands to the version.
  if (!/^[A-Za-z0-9._-]+$/.test(codename)) {
    die(
      `Invalid codename ${JSON.stringify(codename)}.`,
      "Use letters, digits, dot, dash or underscore only.",
    );
  }

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== RELEASE_BRANCH) {
    die(
      `Refusing to release from "${branch}".`,
      `Releases must run on ${RELEASE_BRANCH}; nothing was changed.`,
    );
  }

  git(["fetch", "origin", "--tags"]);

  const behind = git([
    "rev-list",
    "--count",
    `${RELEASE_BRANCH}..origin/${RELEASE_BRANCH}`,
  ]);
  if (behind !== "0") {
    die(
      `origin/${RELEASE_BRANCH} is ${behind} commit(s) ahead of yours.`,
      `Run: git pull --rebase origin ${RELEASE_BRANCH}`,
    );
  }

  const preRunHead = git(["rev-parse", "HEAD"]);
  console.log(`Releasing from ${preRunHead} on ${branch}`);

  try {
    run(
      "npm",
      [
        "version",
        bumpType,
        ...passthrough,
        "--tag-version-prefix=v",
        "-m",
        `chore: release version %s-${codename}`,
      ],
      { CMU_CODENAME: codename },
    );
  } catch {
    rollback("npm version failed.", preRunHead);
  }

  try {
    run("git", ["push", "--atomic", "origin", RELEASE_BRANCH, "--follow-tags"]);
  } catch {
    rollback(
      `Push to origin/${RELEASE_BRANCH} failed (remote moved, or the tag exists there).`,
      preRunHead,
    );
  }

  const { version } = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  console.log(`\nReleased v${version} (${codename})`);
}

main();
