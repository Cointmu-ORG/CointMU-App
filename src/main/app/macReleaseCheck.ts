/**
 * Release lookup for macOS builds that are not notarized (#164). Such a build
 * cannot install an update itself, so it only asks GitHub for the latest
 * release and links to its page. It never goes through electron-updater: even
 * that one's check writes userData/.updaterId.
 */

const REPOSITORY_PATH = "/Cointmu-ORG/CointMU-App";
const RELEASES_PAGE_PATH_PREFIX = `${REPOSITORY_PATH}/releases/`;
const RELEASES_PAGE_PREFIX = `https://github.com${RELEASES_PAGE_PATH_PREFIX}`;
export const LATEST_RELEASE_PAGE = `${RELEASES_PAGE_PREFIX}latest`;
// /releases/latest skips drafts and prereleases.
const LATEST_RELEASE_API = `https://api.github.com/repos${REPOSITORY_PATH}/releases/latest`;
const ALLOWED_PAGE_HOST = "github.com";
const RELEASE_CHECK_TIMEOUT_MS = 15_000;
// Releases are tagged vX.Y.Z; anything else is not a version to offer.
const RELEASE_VERSION_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Version = readonly [number, number, number];

/** The newer release a notice offers. */
export interface MacRelease {
  /** X.Y.Z, without the tag's "v". */
  readonly version: string;
  /** Its release page; always passes isAllowedReleasePageUrl. */
  readonly pageUrl: string;
}

/**
 * @param tag - A release tag or version (v1.9.3, 1.9.3).
 * @returns Its major, minor and patch, or null when it is not X.Y.Z.
 */
export function parseReleaseVersion(tag: string): Version | null {
  const match = RELEASE_VERSION_RE.exec(tag);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param candidate - The release's version.
 * @param current - The running app's version.
 * @returns Whether candidate is a higher X.Y.Z than current. False when either
 *   is not X.Y.Z.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseReleaseVersion(candidate);
  const running = parseReleaseVersion(current);
  if (!next || !running) return false;
  const differing = next.findIndex((part, i) => part !== running[i]);
  return differing !== -1 && next[differing] > running[differing];
}

/**
 * The only pages the notice may open: this repository's releases on
 * github.com over https, written exactly as the URL parser would write it
 * (no credentials, port, query, fragment or dot segments).
 * @param url - The URL to open.
 * @returns Whether shell.openExternal may open it.
 */
export function isAllowedReleasePageUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return (
    parsed !== null &&
    parsed.href === url &&
    parsed.protocol === "https:" &&
    parsed.host === ALLOWED_PAGE_HOST &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.pathname.startsWith(RELEASES_PAGE_PATH_PREFIX)
  );
}

/**
 * @param version - A parsed release version.
 * @returns Its release page, built from the numbers only.
 */
function releasePageUrl([major, minor, patch]: Version): string {
  return `${RELEASES_PAGE_PREFIX}tag/v${major}.${minor}.${patch}`;
}

/**
 * @param body - The parsed /releases/latest response.
 * @returns The release's tag.
 * @throws When the response is not a published, final release.
 */
function readReleaseTag(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new Error("GitHub latest release: response is not an object");
  }
  const { tag_name: tag, draft, prerelease } = body as Record<string, unknown>;
  if (typeof tag !== "string" || draft !== false || prerelease !== false) {
    throw new Error("GitHub latest release: not a published final release");
  }
  return tag;
}

/**
 * Asks the GitHub releases API for the latest release. Reads nothing from
 * and writes nothing to disk.
 * @param currentVersion - The running app's version (app.getVersion()).
 * @param fetchRelease - fetch, replaceable in tests.
 * @returns The latest release when it is newer than currentVersion, else null.
 * @throws When the request fails, times out, or the answer is not a release
 *   tagged vX.Y.Z.
 */
export async function fetchNewerMacRelease(
  currentVersion: string,
  fetchRelease: typeof fetch = fetch,
): Promise<MacRelease | null> {
  const response = await fetchRelease(LATEST_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CointMU-Desktop",
    },
    signal: AbortSignal.timeout(RELEASE_CHECK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub latest release: HTTP ${response.status}`);
  }
  const tag = readReleaseTag(await response.json());
  const version = parseReleaseVersion(tag);
  if (!version) {
    throw new Error(`GitHub latest release: tag ${tag} is not vX.Y.Z`);
  }
  if (!isNewerVersion(tag, currentVersion)) return null;
  return { version: version.join("."), pageUrl: releasePageUrl(version) };
}
