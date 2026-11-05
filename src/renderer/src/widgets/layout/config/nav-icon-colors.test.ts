import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ICON_COLOR_CLASS, navIconClass } from "./nav-icon-colors";

const CSS = readFileSync(
  resolve(__dirname, "../../../app/styles/index.css"),
  "utf8",
);
const VIEWS = Object.keys(NAV_ICON_COLOR_CLASS);
// WCAG 1.4.11, non-text contrast of the icons.
const MIN_ICON_CONTRAST = 3;
// The sidebar (bg-white / dark:bg-gray-950) and an item's hover background
// (hover:bg-slate-50 / dark:hover:bg-gray-800), Tailwind's values.
const LIGHT_BACKGROUNDS = ["#ffffff", "#f8fafc"];
const DARK_BACKGROUNDS = ["#030712", "#1f2937"];

/**
 * @param block - CSS text holding the tokens.
 * @returns The --color-nav-<name> values by name.
 */
function readTokens(block: string): Record<string, string> {
  const pattern = /--color-nav-([a-z]+):\s*(#[0-9a-f]{6})/g;
  return Object.fromEntries(
    [...block.matchAll(pattern)].map(([, name, hex]) => [name, hex]),
  );
}

const themeBlock = CSS.slice(CSS.indexOf("@theme"), CSS.indexOf("@layer"));
const darkBlock = CSS.slice(CSS.indexOf(".dark {"));
const LIGHT = readTokens(themeBlock);
const DARK = readTokens(darkBlock.slice(0, darkBlock.indexOf("}")));

/**
 * @param hex - "#rrggbb".
 * @returns The WCAG relative luminance.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param a - "#rrggbb".
 * @param b - "#rrggbb".
 * @returns The WCAG contrast ratio.
 */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("sidebar icon color tokens", () => {
  const tokenOf = (view: string): string =>
    NAV_ICON_COLOR_CLASS[view].replace("text-nav-", "");

  it("defines a light and a dark color for every item, all different", () => {
    const names = VIEWS.map(tokenOf);

    expect(Object.keys(LIGHT).sort()).toEqual([...names].sort());
    expect(Object.keys(DARK).sort()).toEqual([...names].sort());
    expect(new Set(Object.values(LIGHT)).size).toBe(names.length);
    expect(new Set(Object.values(DARK)).size).toBe(names.length);
  });

  it.each(VIEWS)("keeps the %s icon at 3:1 or more in both themes", (view) => {
    const name = tokenOf(view);

    for (const background of LIGHT_BACKGROUNDS) {
      expect(contrast(LIGHT[name], background)).toBeGreaterThanOrEqual(
        MIN_ICON_CONTRAST,
      );
    }
    for (const background of DARK_BACKGROUNDS) {
      expect(contrast(DARK[name], background)).toBeGreaterThanOrEqual(
        MIN_ICON_CONTRAST,
      );
    }
  });
});

describe("navIconClass", () => {
  it("leaves every icon monochrome while the setting is off", () => {
    for (const view of VIEWS) {
      expect(navIconClass(view, "dashboard", false)).toBeUndefined();
    }
  });

  it("colors the inactive items and keeps the active one white", () => {
    expect(navIconClass("miner", "dashboard", true)).toBe("text-nav-mining");
    expect(navIconClass("dashboard", "dashboard", true)).toBeUndefined();
  });
});
