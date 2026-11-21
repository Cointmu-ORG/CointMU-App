// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CMU_LOGO_URL } from "@/shared/brand";
import { useAssetLogoStore } from "../model/asset-logo.store";
import { NATIVE_ASSET_ADDRESS } from "../model/wallet-asset.types";
import { TokenIcon } from "./token-icon.component";

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CUSTOM = "data:image/png;base64,iVBORw0KGgo=";

let container: HTMLDivElement;
let root: Root;

function render(address: string): HTMLImageElement | null {
  act(() => root.render(<TokenIcon address={address} symbol="X" />));
  return container.querySelector("img");
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  // isLoaded stops ensureLoaded from calling window.api.
  useAssetLogoStore.setState({
    isLoaded: true,
    logos: { [NATIVE_ASSET_ADDRESS]: CUSTOM, [TOKEN]: CUSTOM },
  });
});

afterEach(() => {
  act(() => root.unmount());
});

describe("TokenIcon", () => {
  it("always shows the official logo for CMU, even with a stored custom one", () => {
    expect(render(NATIVE_ASSET_ADDRESS)?.getAttribute("src")).toBe(
      CMU_LOGO_URL,
    );
  });

  it("shows a token's custom logo, whatever the address case", () => {
    expect(
      render(TOKEN.toUpperCase().replace("0X", "0x"))?.getAttribute("src"),
    ).toBe(CUSTOM);
  });

  it("falls back to initials for a token without a custom logo", () => {
    useAssetLogoStore.setState({ logos: {} });
    expect(render(TOKEN)).toBeNull();
    expect(container.textContent).toBe("X");
  });
});
