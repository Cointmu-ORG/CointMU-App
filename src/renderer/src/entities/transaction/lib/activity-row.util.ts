import type { TFunction } from "i18next";
import { ActivityKind, type WalletActivity } from "@bridge/types";
import { formatAge } from "@/shared/lib";
import type { ActivityData, ActivityType } from "@/shared/ui";

const HASH_PREVIEW_LENGTH = 8;
const ADDRESS_HEAD_LENGTH = 6;
const ADDRESS_TAIL_LENGTH = 4;

const ACTIVITY_TYPES: Record<ActivityKind, ActivityType> = {
  [ActivityKind.SEND]: "send",
  [ActivityKind.RECEIVE]: "receive",
  [ActivityKind.CONTRACT_CALL]: "contract",
  [ActivityKind.CONTRACT_DEPLOY]: "contract",
  [ActivityKind.MINING_REWARD]: "mining",
};

const TITLE_KEYS: Record<ActivityKind, string> = {
  [ActivityKind.SEND]: "common:activity.sentCmu",
  [ActivityKind.RECEIVE]: "common:activity.receivedCmu",
  [ActivityKind.CONTRACT_CALL]: "common:activity.contractCall",
  [ActivityKind.CONTRACT_DEPLOY]: "common:activity.contractDeployment",
  [ActivityKind.MINING_REWARD]: "common:activity.miningReward",
};

/**
 * Shortens an address to its first 6 and last 4 characters.
 * @param address - The full 0x address.
 * @returns The shortened address, e.g. 0x1234...abcd.
 */
export function shortenAddress(address: string): string {
  return `${address.slice(0, ADDRESS_HEAD_LENGTH)}...${address.slice(-ADDRESS_TAIL_LENGTH)}`;
}

/** The saved name of an address, if the user gave it one. */
export type AddressNameOf = (address: string) => string | undefined;

/**
 * @param address - The full 0x address.
 * @param nameOf - Saved address names.
 * @returns The short address, after the saved name when there is one.
 */
export function displayAddress(
  address: string,
  nameOf?: AddressNameOf,
): string {
  const short = shortenAddress(address);
  const name = nameOf?.(address);
  return name === undefined ? short : `${name} (${short})`;
}

function describeActivity(
  activity: WalletActivity,
  t: TFunction,
  nameOf?: AddressNameOf,
): string {
  switch (activity.kind) {
    case ActivityKind.CONTRACT_DEPLOY:
      return t("common:activity.hash", {
        hash: (activity.hash ?? "").slice(0, HASH_PREVIEW_LENGTH),
      });
    case ActivityKind.RECEIVE:
      return t("common:activity.from", {
        address: displayAddress(activity.from ?? "", nameOf),
      });
    case ActivityKind.MINING_REWARD:
      return t("common:activity.fromMiningPool", {
        block: activity.blockNumber,
      });
    default:
      return t("common:activity.to", {
        address: displayAddress(activity.to, nameOf),
      });
  }
}

/**
 * Builds the localized row for one activity event from the main block scan.
 * Call it at render so a language change applies without a refetch.
 * @param activity - The raw event from `window.api.wallet.getActivity`.
 * @param t - Translator for the row text.
 * @param locale - Language tag for the relative age.
 * @param nameOf - Saved address names; the row keeps the raw from/to.
 * @returns The row the activity lists and CSV export render.
 */
export function toActivityRow(
  activity: WalletActivity,
  t: TFunction,
  locale: string,
  nameOf?: AddressNameOf,
): ActivityData {
  const confirmations = t("common:activity.confirmations", {
    count: activity.confirmations,
  });
  return {
    id: activity.id,
    kind: activity.kind,
    type: ACTIVITY_TYPES[activity.kind],
    title: activity.token
      ? t("common:activity.sentToken", { symbol: activity.token.symbol })
      : t(TITLE_KEYS[activity.kind]),
    subtitle: describeActivity(activity, t, nameOf),
    amount: activity.amount,
    timestamp: activity.timestamp,
    blockNumber: activity.blockNumber,
    timestampStr: `${formatAge(activity.timestamp, locale)} · ${confirmations}`,
    hash: activity.hash,
    from: activity.from,
    to: activity.to,
    token: activity.token,
  };
}
