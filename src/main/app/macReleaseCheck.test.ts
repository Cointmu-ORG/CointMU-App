import { describe, expect, it, vi } from "vitest";
import {
  LATEST_RELEASE_PAGE,
  fetchNewerMacRelease,
  isAllowedReleasePageUrl,
  isNewerVersion,
  parseReleaseVersion,
} from "./macReleaseCheck";

const LATEST_API =
  "https://api.github.com/repos/Cointmu-ORG/CointMU-App/releases/latest";

function answering(body: unknown, status = 200): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;
}

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  ...extra,
});

describe("parseReleaseVersion", () => {
  it.each([
    ["v1.9.3", [1, 9, 3]],
    ["1.10.0", [1, 10, 0]],
    ["v0.0.1", [0, 0, 1]],
  ])("reads %s", (tag, expected) => {
    expect(parseReleaseVersion(tag)).toEqual(expected);
  });

  it.each([
    "v1.9",
    "v1.9.3-beta.1",
    "v1.9.3+build",
    "v01.9.3",
    "1.9.3/../../evil",
    " v1.9.3",
    "",
  ])("rejects %j", (tag) => {
    expect(parseReleaseVersion(tag)).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it.each([
    ["v1.9.4", "1.9.3", true],
    ["v1.10.0", "1.9.3", true],
    ["v2.0.0", "1.99.99", true],
    ["v1.9.3", "1.9.3", false],
    ["v1.9.2", "1.9.3", false],
    ["v1.8.9", "1.9.0", false],
    ["v9.9.9-rc.1", "1.9.3", false],
    ["v9.9.9", "not a version", false],
  ])("%s over %s: %s", (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected);
  });
});

describe("isAllowedReleasePageUrl", () => {
  it.each([
    "https://github.com/Cointmu-ORG/CointMU-App/releases/tag/v1.9.4",
    LATEST_RELEASE_PAGE,
  ])("allows %s", (url) => {
    expect(isAllowedReleasePageUrl(url)).toBe(true);
  });

  it.each([
    "http://github.com/Cointmu-ORG/CointMU-App/releases/latest",
    "https://github.com/Cointmu-ORG/CointMU-App/releases",
    "https://github.com/Cointmu-ORG/CointMU-App/issues/1",
    "https://github.com/someone-else/CointMU-App/releases/latest",
    "https://github.com/Cointmu-ORG/CointMU-App/releases/../../evil",
    "https://github.com/Cointmu-ORG/CointMU-App/releases/%2e%2e/x",
    "https://github.com.evil.example/Cointmu-ORG/CointMU-App/releases/latest",
    "https://evil.example@github.com/Cointmu-ORG/CointMU-App/releases/latest",
    "https://github.com:8443/Cointmu-ORG/CointMU-App/releases/latest",
    "https://GitHub.com/Cointmu-ORG/CointMU-App/releases/latest",
    "https://github.com/Cointmu-ORG/CointMU-App/releases/latest?x=1",
    "https://github.com/Cointmu-ORG/CointMU-App/releases/latest#x",
    "file:///Applications/CointMU.app",
    "javascript:alert(1)",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isAllowedReleasePageUrl(url)).toBe(false);
  });
});

describe("fetchNewerMacRelease", () => {
  it("returns a newer release with its page, from the latest-release API", async () => {
    const fetchRelease = answering(release("v1.10.0"));

    const result = await fetchNewerMacRelease("1.9.3", fetchRelease);

    expect(result).toEqual({
      version: "1.10.0",
      pageUrl:
        "https://github.com/Cointmu-ORG/CointMU-App/releases/tag/v1.10.0",
    });
    expect(isAllowedReleasePageUrl(result?.pageUrl ?? "")).toBe(true);
    expect(fetchRelease).toHaveBeenCalledWith(
      LATEST_API,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each(["v1.9.3", "v1.9.2"])(
    "returns null when the latest is %s and 1.9.3 runs",
    async (tag) => {
      expect(await fetchNewerMacRelease("1.9.3", answering(release(tag)))).toBe(
        null,
      );
    },
  );

  it.each([
    ["an HTTP error", answering({ message: "rate limited" }, 403)],
    ["a draft", answering(release("v9.9.9", { draft: true }))],
    ["a prerelease", answering(release("v9.9.9", { prerelease: true }))],
    ["a tag that is not vX.Y.Z", answering(release("v9.9.9/../../evil"))],
    ["no tag", answering({ draft: false, prerelease: false })],
    ["not an object", answering(["v9.9.9"])],
  ])("throws on %s", async (_label, fetchRelease) => {
    await expect(fetchNewerMacRelease("1.9.3", fetchRelease)).rejects.toThrow(
      /GitHub latest release/,
    );
  });

  it("passes a network failure on", async () => {
    const fetchRelease = vi.fn(() =>
      Promise.reject(new TypeError("fetch failed")),
    ) as unknown as typeof fetch;

    await expect(fetchNewerMacRelease("1.9.3", fetchRelease)).rejects.toThrow(
      "fetch failed",
    );
  });
});
