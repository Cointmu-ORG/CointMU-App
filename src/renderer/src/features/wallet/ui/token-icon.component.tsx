import { type JSX, useEffect } from "react";
import { CMU_LOGO_URL } from "@/shared/brand";
import { getTokenGradient, getTokenInitials } from "../lib/token-icon.util";
import { useAssetLogoStore } from "../model/asset-logo.store";
import { NATIVE_ASSET_ADDRESS } from "../model/wallet-asset.types";

const SIZE_CLASSES = {
  xs: "w-4 h-4 text-[7px]",
  sm: "w-6 h-6 text-[9px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-12 h-12 text-sm",
} as const;

interface TokenIconProps {
  address: string;
  symbol: string;
  size?: keyof typeof SIZE_CLASSES;
}

/**
 * Circular token avatar. CMU always shows the official CointMU logo; other
 * tokens show the logo the user uploaded, or a gradient with their initials.
 * The gradient is derived from the contract address
 * so every token gets a unique, consistent colour without requiring any stored
 * colour metadata.
 * @param props - The contract address, token symbol, and optional size variant.
 * @returns The rendered circular token icon element.
 */
function TokenIcon({
  address,
  symbol,
  size = "md",
}: TokenIconProps): JSX.Element {
  const isNative = address === NATIVE_ASSET_ADDRESS;
  const customLogo = useAssetLogoStore((s) => s.logos[address.toLowerCase()]);
  const ensureLoaded = useAssetLogoStore((s) => s.ensureLoaded);
  useEffect(ensureLoaded, [ensureLoaded]);

  // CMU always shows the official logo, even if one was stored for it before.
  const logo = isNative ? CMU_LOGO_URL : customLogo;
  if (logo !== undefined) {
    return (
      <img
        src={logo}
        alt=""
        draggable={false}
        className={`${SIZE_CLASSES[size]} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  const gradient = getTokenGradient(address);
  const initials = getTokenInitials(symbol);

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
      style={{ background: gradient }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export { TokenIcon };
export type { TokenIconProps };
