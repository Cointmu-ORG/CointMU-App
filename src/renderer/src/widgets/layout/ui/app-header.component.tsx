import type { JSX } from "react";
import { NodeRecoveryBanner } from "@/features/mining";
import { CustomTitleBar } from "./custom-title-bar.component";

/**
 * Top of the app shell: the frameless title bar followed by app-wide status
 * banners. Composition only; each banner owns its own state.
 * @returns The stacked title bar and banners.
 */
export function AppHeader(): JSX.Element {
  return (
    <>
      <CustomTitleBar />
      <NodeRecoveryBanner />
    </>
  );
}
