/**
 * Icon color utility per sidebar view. The colors are the --color-nav-*
 * tokens in app/styles/index.css (light and dark values live there).
 */
export const NAV_ICON_COLOR_CLASS: Readonly<Record<string, string>> = {
  dashboard: "text-nav-dashboard",
  miner: "text-nav-mining",
  wallet: "text-nav-wallet",
  explorer: "text-nav-explorer",
  settings: "text-nav-settings",
};

/**
 * @param view - The item's view.
 * @param activeView - The open view; its item keeps the white icon on the
 *   accent background, so it stays distinct from the colored ones.
 * @param isColored - Settings → Appearance → Colored sidebar icons.
 * @returns The icon's color class, or undefined for the monochrome icon.
 */
export function navIconClass(
  view: string,
  activeView: string,
  isColored: boolean,
): string | undefined {
  if (!isColored || view === activeView) return undefined;
  return NAV_ICON_COLOR_CLASS[view];
}
