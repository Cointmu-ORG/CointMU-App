import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { ActivityKind, type WalletActivity } from "@bridge/types";
import { toActivityRow } from "./activity-row.util";

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const ME = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const BASE: WalletActivity = {
  id: "0xabcdef0123456789",
  kind: ActivityKind.SEND,
  amount: "1.50",
  timestamp: 0,
  blockNumber: 42,
  confirmations: 3,
  hash: "0xabcdef0123456789",
  from: ME,
  to: OTHER,
};

describe("toActivityRow", () => {
  it("maps each kind to its icon type, title and detail", () => {
    const cases = [
      [ActivityKind.SEND, "send", "sentCmu", 'to {"address":"0x2222...2222"}'],
      [
        ActivityKind.RECEIVE,
        "receive",
        "receivedCmu",
        'from {"address":"0x1111...1111"}',
      ],
      [
        ActivityKind.CONTRACT_CALL,
        "contract",
        "contractCall",
        'to {"address":"0x2222...2222"}',
      ],
      [
        ActivityKind.CONTRACT_DEPLOY,
        "contract",
        "contractDeployment",
        'hash {"hash":"0xabcdef"}',
      ],
      [
        ActivityKind.MINING_REWARD,
        "mining",
        "miningReward",
        'fromMiningPool {"block":42}',
      ],
    ] as const;

    for (const [kind, type, title, subtitle] of cases) {
      const row = toActivityRow({ ...BASE, kind }, t, "en");

      expect(row).toMatchObject({
        kind,
        type,
        title: `common:activity.${title}`,
        subtitle: `common:activity.${subtitle}`,
      });
    }
  });

  it("puts the age and pluralized confirmations in timestampStr", () => {
    const row = toActivityRow(BASE, t, "en");

    expect(row.timestampStr).toBe(
      '-- · common:activity.confirmations {"count":3}',
    );
  });

  it("does not crash on a deployment without a hash", () => {
    const row = toActivityRow(
      { ...BASE, kind: ActivityKind.CONTRACT_DEPLOY, hash: undefined, to: "" },
      t,
      "en",
    );

    expect(row.subtitle).toBe('common:activity.hash {"hash":""}');
  });
});
