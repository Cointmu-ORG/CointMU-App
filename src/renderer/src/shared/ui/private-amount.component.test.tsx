import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivateAmount } from "./private-amount.component";

const prefs = { isPrivacyMode: false };

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/shared/model", () => ({
  useDisplayPrefs: (select: (state: typeof prefs) => unknown) => select(prefs),
}));

const render = (isPrivate?: boolean): string =>
  renderToStaticMarkup(
    <PrivateAmount isPrivate={isPrivate}>1,284.67</PrivateAmount>,
  );

describe("PrivateAmount", () => {
  beforeEach(() => {
    prefs.isPrivacyMode = false;
  });

  it("shows the amount while privacy mode is off", () => {
    expect(render()).toBe("1,284.67");
  });

  it("masks it while privacy mode is on, with an accessible name", () => {
    prefs.isPrivacyMode = true;

    const html = render();

    expect(html).not.toContain("1,284.67");
    expect(html).toContain("••••");
    expect(html).toContain('aria-label="common:privacy.hiddenAmount"');
  });

  it("never masks someone else's amount", () => {
    prefs.isPrivacyMode = true;

    expect(render(false)).toBe("1,284.67");
  });
});
