import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ContractIcon, MiningIcon, ReceiveIcon, SendIcon } from "../icons";

export type ActivityType = "mining" | "send" | "receive" | "contract";

export interface ActivityData {
  id: string;
  type: ActivityType;
  title: string;
  subtitle: string;
  amount: string;
  timestamp: number;
  timestampStr: string;
  blockNumber?: number;
  hash?: string;
  from?: string;
  to?: string;
  pending?: boolean;
}

interface ActivityItemProps {
  activity: ActivityData;
}

/**
 * A reusable transaction list item that renders specific visual states
 * (mining, sent, received, contract call) according to the design specifications.
 * @param props - Activity data representing the transaction.
 * @returns The rendered list item.
 */
function ActivityItem({ activity }: ActivityItemProps): JSX.Element {
  const { t } = useTranslation();

  let Icon: JSX.Element;
  let bgClass: string;
  let amountClass: string;
  let displayAmount: string;

  switch (activity.type) {
    case "mining":
      bgClass =
        "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500";
      amountClass = "text-emerald-500";
      displayAmount = `+${activity.amount}`;
      Icon = <MiningIcon />;
      break;
    case "send":
      bgClass = "bg-orange-100 dark:bg-orange-900/30 text-orange-500";
      amountClass = "text-slate-800 dark:text-gray-100";
      displayAmount = `-${activity.amount}`;
      Icon = <SendIcon />;
      break;
    case "receive":
      bgClass = "bg-blue-100 dark:bg-blue-900/30 text-blue-500";
      amountClass = "text-emerald-500";
      displayAmount = `+${activity.amount}`;
      Icon = <ReceiveIcon />;
      break;
    case "contract":
      bgClass = "bg-purple-100 dark:bg-purple-900/30 text-purple-500";
      amountClass = "text-slate-800 dark:text-gray-100";
      displayAmount = `-${activity.amount}`;
      Icon = <ContractIcon />;
      break;
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${bgClass}`}
        >
          {Icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-800 dark:text-gray-100">
              {activity.title}
            </h4>
            {activity.pending && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600 text-[10px] font-bold uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {t("wallet:activity.pending")}
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 mt-0.5">
            {activity.subtitle}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-bold font-mono ${activity.pending ? "text-slate-400" : amountClass}`}
        >
          {displayAmount}{" "}
          <span className="text-[10px] text-slate-400 font-sans ml-0.5">
            CMU
          </span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{activity.timestampStr}</p>
      </div>
    </div>
  );
}

export { ActivityItem };
