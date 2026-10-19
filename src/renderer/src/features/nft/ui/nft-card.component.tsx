import { type JSX } from "react";
import Avatar from "boring-avatars";

export interface NFTCardProps {
  name: string;
  subtitle: string;
  imageUrl: string;
  standard: "ERC-721" | "ERC-1155";
  tokenHash: string;
}

/**
 * Renders an individual NFT card matching the specified design: a white container
 * with rounded corners, a large image area taking up 90% of the card height,
 * an absolutely positioned translucent badge in the top-right corner, and a
 * compact text footer for the title and collection subtitle. When no image URL
 * is available the image area is filled with a deterministic boring-avatars
 * marble avatar seeded from the token's unique composite hash.
 * @param {NFTCardProps} props - The NFT metadata and unique token hash to display.
 * @returns {JSX.Element} The rendered NFT card component.
 */
function NFTCard({
  name,
  subtitle,
  imageUrl,
  standard,
  tokenHash,
}: NFTCardProps): JSX.Element {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="relative w-full h-48 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Avatar size={500} name={tokenHash} variant="marble" square />
          </div>
        )}
        <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-md">
          {standard}
        </div>
      </div>
      <div className="px-4 pt-2 pb-2 bg-white dark:bg-transparent flex flex-col">
        <span className="text-black dark:text-gray-100 font-bold text-base truncate">
          {name}
        </span>
        <span className="text-gray-500 dark:text-gray-400 text-sm font-medium truncate">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

export { NFTCard };
