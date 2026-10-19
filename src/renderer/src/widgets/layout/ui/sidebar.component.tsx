import { useState, useRef, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { type DerivedAccount } from "@/features/wallet";
import { type UpdaterStatus } from "@/shared/lib";
import { useAppStore } from "@/shared/model";
import { NotificationCenter } from "@/features/notifications";
import {
  Zap,
  Grid,
  Cpu,
  Wallet,
  Search,
  Settings,
  LockOpen,
} from "lucide-react";

interface SidebarProps {
  accounts: DerivedAccount[];
  activeWalletAddress: string | null;
  activeView: string;
  setActiveView: (view: string) => void;
  onLogout: () => void;
  updateStatus: UpdaterStatus;
}

const APP_NETWORK = "testnet";

/**
 * Sidebar navigation component with workspace routing and a popover-enabled
 * user profile section for locking the wallet.
 * @param props The properties to configure and control the sidebar state.
 * @returns The Sidebar component.
 */
export function Sidebar({
  accounts,
  activeWalletAddress,
  activeView,
  setActiveView,
  onLogout,
  updateStatus,
}: SidebarProps): JSX.Element {
  const balance = useAppStore((s) => s.balance);
  const peerCount = useAppStore((s) => s.peerCount);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation(["common"]);

  const activeAccount =
    accounts.find((a) => a.address === activeWalletAddress) || accounts[0];
  const abbrAddress = activeWalletAddress
    ? `${activeWalletAddress.substring(0, 6)}...${activeWalletAddress.substring(activeWalletAddress.length - 4)}`
    : "--";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="w-56 flex flex-col border-r border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm shadow-accent/20">
            <Zap color="white" width={16} height={16} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
              CointMU
            </p>
            <p className="text-[10px] text-slate-400 tracking-wide">
              v{window.systemInfo?.version || "0.0.1"} - {APP_NETWORK}
            </p>
          </div>
        </div>
        <NotificationCenter />
      </div>

      <div className="px-4 py-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-gray-900 border border-slate-100 dark:border-gray-800">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium text-slate-600">
            {t("sidebar.connectedTo")}
            <span className="font-semibold text-accent ml-1">
              CointMU Mainnet
            </span>
          </span>
          <span className="ml-auto text-[10px] font-bold text-slate-500">
            {peerCount !== null ? peerCount : "--"}
          </span>
          <span className="text-[10px] text-slate-400">
            {t("sidebar.peers")}
          </span>
        </div>
      </div>

      <div className="px-4 pt-5 pb-1">
        <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-slate-400 px-2">
          {t("sidebar.workspace")}
        </p>
      </div>
      <nav className="flex-1 px-3 py-1 space-y-0.5">
        <button
          onClick={() => setActiveView("dashboard")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            activeView === "dashboard"
              ? "bg-accent text-white shadow-sm shadow-accent/20"
              : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100"
          }`}
        >
          <Grid width={18} height={18} />
          {t("sidebar.dashboard")}
        </button>

        <button
          onClick={() => setActiveView("miner")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            activeView === "miner"
              ? "bg-accent text-white shadow-sm shadow-accent/20"
              : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100"
          }`}
        >
          <Cpu width={18} height={18} />
          {t("sidebar.mining")}
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </button>

        <button
          onClick={() => setActiveView("wallet")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            activeView === "wallet"
              ? "bg-accent text-white shadow-sm shadow-accent/20"
              : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100"
          }`}
        >
          <Wallet width={18} height={18} />
          {t("sidebar.wallet")}
        </button>

        <button
          onClick={() => setActiveView("explorer")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            activeView === "explorer"
              ? "bg-accent text-white shadow-sm shadow-accent/20"
              : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100"
          }`}
        >
          <Search width={18} height={18} />
          {t("sidebar.explorer")}
        </button>

        <div className="pt-4 pb-1 px-2">
          <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-slate-400">
            {t("sidebar.system")}
          </p>
        </div>

        <button
          onClick={() => setActiveView("settings")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
            activeView === "settings"
              ? "bg-accent text-white shadow-sm shadow-accent/20"
              : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100"
          }`}
        >
          <Settings width={18} height={18} />
          {t("sidebar.settings")}
          {(updateStatus === "available" ||
            updateStatus === "downloading" ||
            updateStatus === "downloaded") && (
            <span className="ml-auto w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
        </button>
      </nav>

      <div
        className="relative px-4 py-3 border-t border-slate-100 dark:border-gray-800"
        ref={popoverRef}
      >
        {isPopoverOpen && (
          <div className="absolute bottom-full mb-2 left-4 right-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 origin-bottom">
            <button
              onClick={() => {
                setIsPopoverOpen(false);
                setActiveView("settings");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <Settings
                className="text-slate-400"
                width={14}
                height={14}
                strokeWidth={2.5}
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-gray-300">
                {t("sidebar.settings")}
              </span>
            </button>
            <div className="h-px bg-slate-100 dark:bg-gray-800 my-1 mx-2" />
            <button
              onClick={() => {
                setIsPopoverOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors text-left group"
            >
              <LockOpen
                className="text-red-400 group-hover:text-red-500 transition-colors"
                width={14}
                height={14}
                strokeWidth={2.5}
              />
              <span className="text-xs font-semibold text-red-600">
                {t("sidebar.lockWallet")}
              </span>
            </button>
          </div>
        )}

        <button
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus:outline-none"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-gray-800 dark:to-gray-800 dark:border dark:border-gray-700 flex items-center justify-center">
            <Wallet
              className="text-slate-500 dark:text-gray-300"
              width={16}
              height={16}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-gray-100 truncate">
                {activeAccount?.label || "Wallet"}
              </p>
              <p className="text-xs font-bold text-slate-800 dark:text-gray-100 ml-2">
                {balance}
              </p>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <p
                className="text-[10px] text-slate-400 font-mono"
                title={activeWalletAddress || undefined}
              >
                {abbrAddress}
              </p>
              <p className="text-[10px] text-slate-400">CMU</p>
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}
