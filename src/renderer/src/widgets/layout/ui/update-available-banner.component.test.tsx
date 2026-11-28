import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Updater } from "@/shared/lib";
import { UpdateAvailableBanner } from "./update-available-banner.component";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) =>
      options?.version ? `${key}(${options.version})` : key,
  }),
}));

const updater = (overrides: Partial<Updater>): Updater => ({
  status: "available",
  info: { version: "9.9.9" },
  progress: null,
  error: null,
  shouldAskToInstall: false,
  isManualInstall: true,
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  openReleasePage: vi.fn(),
  ...overrides,
});

const render = (overrides: Partial<Updater>): string =>
  renderToStaticMarkup(<UpdateAvailableBanner updater={updater(overrides)} />);

describe("UpdateAvailableBanner", () => {
  it("tells about a release to install by hand, with its version", () => {
    const html = render({});

    expect(html).toContain("common:update.availableTitle");
    expect(html).toContain("common:update.availableBody(9.9.9)");
    expect(html).toContain("common:update.openReleasePage");
  });

  it.each([
    ["an update that installs itself", { isManualInstall: false }],
    ["no update", { status: "not-available" as const }],
    ["a downloaded update", { status: "downloaded" as const }],
  ])("shows nothing for %s", (_label, overrides) => {
    expect(render(overrides)).toBe("");
  });
});
