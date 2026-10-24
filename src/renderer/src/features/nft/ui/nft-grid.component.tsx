import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { NFTCard } from "./nft-card.component";
import { type NFTMetadata } from "../api/nft.service";

interface NFTGridProps {
  nfts: NFTMetadata[];
}

/**
 * Renders a fixed three-column grid of NFTCard components.
 * @param {NFTGridProps} props - The array of resolved NFT metadata to display.
 * @returns {JSX.Element} The rendered NFT grid component.
 */
function NFTGrid({ nfts }: NFTGridProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-4">
      {nfts.map((nft) => (
        <NFTCard
          key={`${nft.contractAddress}-${nft.tokenId}`}
          name={nft.name}
          subtitle={
            nft.collectionName ||
            t("walletTabs:nft.tokenId", { id: nft.tokenId })
          }
          imageUrl={nft.image}
          standard={nft.standard}
          tokenHash={`${nft.contractAddress}-${nft.tokenId}`}
        />
      ))}
    </div>
  );
}

export { NFTGrid };
