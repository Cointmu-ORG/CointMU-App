import { AVATAR_PALETTE } from "../config/account.constants";
import { type JSX } from "react";
import Avatar from "boring-avatars";

interface AccountIconProps {
  address: string;
  size?: number;
}

/**
 * Renders a deterministic geometric avatar derived from an Ethereum-style
 * hex address. The Bauhaus variant produces an abstract, Mondrian-like
 * composition that is unique per address and stable across renders.
 * @param props.address - The full hex address used to seed the avatar.
 * @param props.size - The rendered pixel dimensions (defaults to 20).
 * @returns The generated SVG avatar element.
 */
function AccountIcon({ address, size = 20 }: AccountIconProps): JSX.Element {
  const seed = address ? address.toLowerCase() : "0x0";
  return (
    <Avatar
      size={size}
      name={seed}
      // you can use: beam, bauhaus, marble, moon, pixel, ring
      variant="beam"
      colors={AVATAR_PALETTE}
    />
  );
}

export { AccountIcon };
