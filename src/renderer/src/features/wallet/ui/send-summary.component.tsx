import type { JSX, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccountIcon } from "@/entities/account";
import type { SendSummary as SendSummaryData } from "../model/send-confirm.types";
import { TokenIcon } from "./token-icon.component";

const RECIPIENT_ICON_PX = 32;
const SENDER_ICON_PX = 20;
const TOTAL_DECIMALS = 6;
const SHORT_ADDRESS_HEAD = 6;
const SHORT_ADDRESS_TAIL = 4;

interface SummaryRowProps {
  label: string;
  children: ReactNode;
}

function SummaryRow({ label, children }: SummaryRowProps): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-xs font-semibold text-slate-500 dark:text-gray-400 shrink-0">
        {label}
      </dt>
      <dd className="text-xs font-mono font-bold text-slate-700 dark:text-gray-200 text-right min-w-0">
        {children}
      </dd>
    </div>
  );
}

function formatTotal(summary: SendSummaryData): string {
  if (!summary.isNative) {
    return `${summary.amount} ${summary.symbol} + ${summary.feeCmu} CMU`;
  }
  const total = parseFloat(summary.amount) + parseFloat(summary.feeCmu);
  return `${total.toFixed(TOTAL_DECIMALS)} CMU`;
}

/**
 * Read-only review of a send: sender, full recipient address with its
 * identicon and saved name, amount, asset, fee and total. Amounts are never masked by
 * privacy mode, so the user can verify exactly what will be signed.
 * @param props.summary - The values copied from the send form.
 * @returns The summary block.
 */
function SendSummary({ summary }: { summary: SendSummaryData }): JSX.Element {
  const { t } = useTranslation();
  const shortFrom = `${summary.fromAddress.slice(0, SHORT_ADDRESS_HEAD)}…${summary.fromAddress.slice(-SHORT_ADDRESS_TAIL)}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-2">
        <TokenIcon
          address={summary.tokenAddress}
          symbol={summary.symbol}
          size="sm"
        />
        <p className="text-3xl font-bold font-mono text-slate-800 dark:text-gray-100 break-all text-center">
          {summary.amount}{" "}
          <span className="text-slate-400 dark:text-gray-400">
            {summary.symbol}
          </span>
        </p>
      </div>

      <div className="bg-slate-50 dark:bg-gray-950 border border-slate-100 dark:border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 mb-2">
          {t("wallet:modals.sendConfirm.to")}
        </p>
        <div className="flex items-center gap-3">
          <span className="shrink-0 rounded-full overflow-hidden">
            <AccountIcon address={summary.toAddress} size={RECIPIENT_ICON_PX} />
          </span>
          <div className="min-w-0">
            {summary.toName !== undefined && (
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">
                {summary.toName}
              </p>
            )}
            <p className="text-xs font-mono font-semibold text-slate-800 dark:text-gray-100 break-all leading-relaxed">
              {summary.toAddress}
            </p>
          </div>
        </div>
      </div>

      <dl className="bg-slate-50 dark:bg-gray-950 border border-slate-100 dark:border-gray-800 rounded-xl px-4 py-1.5 divide-y divide-slate-200 dark:divide-gray-800">
        <SummaryRow label={t("wallet:modals.sendConfirm.from")}>
          <span className="inline-flex items-center gap-2">
            <span className="shrink-0 rounded-full overflow-hidden">
              <AccountIcon
                address={summary.fromAddress}
                size={SENDER_ICON_PX}
              />
            </span>
            <span className="font-sans truncate">{summary.fromLabel}</span>
            <span className="text-slate-400 dark:text-gray-400 font-normal">
              {shortFrom}
            </span>
          </span>
        </SummaryRow>
        <SummaryRow label={t("wallet:modals.sendConfirm.asset")}>
          {summary.symbol}
        </SummaryRow>
        {!summary.isNative && (
          <SummaryRow label={t("wallet:modals.sendConfirm.contract")}>
            <span className="break-all font-normal">
              {summary.tokenAddress}
            </span>
          </SummaryRow>
        )}
        <SummaryRow label={t("wallet:modals.send.networkFee")}>
          {summary.feeCmu} CMU
        </SummaryRow>
        <SummaryRow label={t("wallet:modals.sendConfirm.total")}>
          <span className="text-sm text-slate-800 dark:text-gray-100">
            {formatTotal(summary)}
          </span>
        </SummaryRow>
      </dl>
    </div>
  );
}

export { SendSummary };
