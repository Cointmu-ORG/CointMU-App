import { useState, useEffect, Suspense, lazy, type JSX } from "react";
import ms from "ms";
import { WalletPage as Wallet } from "@/pages/wallet";
import { DashboardPage } from "@/pages/dashboard";
import { AuthFlow } from "@/features/auth";
import { type DerivedAccount } from "@/features/wallet";
import {
  getSetting,
  useSecurityStore,
  useAdvancedStore,
  useConnectedSitesStore,
} from "@/features/settings";
import { useUpdater } from "@/shared/lib";
import { useMiningLogStream, NodeRecoveryBanner } from "@/features/mining";
import { useAppStore } from "@/shared/model";
import { useAuthStore } from "@/features/auth";

import { Sidebar, AppHeader } from "@/widgets/layout";
import { PairingApprovalModal } from "@/features/dapp";
import { ToastViewport, useNotificationStore } from "@/features/notifications";
import { useDappRequestHandler } from "@/features/dapp";
import { useAutoLock } from "@/features/auth";

const Miner = lazy(() =>
  import("@/pages/mining").then((m) => ({ default: m.MiningPage })),
);
const Explorer = lazy(() =>
  import("@/pages/explorer").then((m) => ({ default: m.ExplorerPage })),
);
const Settings = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsPage })),
);

const NAV_ITEM_DASHBOARD = "dashboard";
const NAV_ITEM_MINER = "miner";
const NAV_ITEM_WALLET = "wallet";
const NAV_ITEM_EXPLORER = "explorer";
const NAV_ITEM_SETTINGS = "settings";
const WALLET_LOAD_DELAY_MS = 300;
const GLOBAL_POLL_INTERVAL_MS = ms("3s");
type ActiveView =
  | typeof NAV_ITEM_DASHBOARD
  | typeof NAV_ITEM_MINER
  | typeof NAV_ITEM_WALLET
  | typeof NAV_ITEM_EXPLORER
  | typeof NAV_ITEM_SETTINGS;

/**
 * Root application component rendering a sidebar navigation layout
 * with view routing between Dashboard and Miner panels. Sidebar
 * matches the reference design with CointMU branding, workspace
 * navigation sections, and a bottom wallet status bar.
 * @returns The top-level application shell with sidebar and content area.
 */
function App(): JSX.Element {
  const [activeWalletAddress, setActiveWalletAddress] = useState<string | null>(
    null,
  );
  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [isLoadingWallet, setIsLoadingWallet] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<ActiveView>(NAV_ITEM_DASHBOARD);
  const [settingsTab, setSettingsTab] = useState<string>("general");
  const updater = useUpdater();
  useMiningLogStream();

  useEffect(() => {
    void useNotificationStore.getState().hydrate();
    void useSecurityStore.getState().hydrate();
    void useAdvancedStore.getState().hydrate();

    let offLinked = (): void => {};
    let offStatus = (): void => {};
    let offSite = (): void => {};

    if (window.api?.extension?.onLinked) {
      offLinked = window.api.extension.onLinked(() => {
        useConnectedSitesStore.getState().setExtensionLinked(true);
      });
    }
    if (window.api?.extension?.onStatusChange) {
      offStatus = window.api.extension.onStatusChange((status: boolean) => {
        useConnectedSitesStore.getState().setExtensionLinked(status);
      });
    }
    if (window.api?.dapp?.onSiteConnected) {
      offSite = window.api.dapp.onSiteConnected((origin) => {
        useConnectedSitesStore.getState().addConnectedSite(origin);
      });
    }

    return () => {
      offLinked();
      offStatus();
      offSite();
    };
  }, []);

  useDappRequestHandler();

  const handleNavigate = (view: string, payload?: any) => {
    setActiveView(view as ActiveView);
    if (view === NAV_ITEM_SETTINGS && payload) {
      setSettingsTab(payload);
    }
  };

  const accountsKey = accounts.map((a) => a.address).join(",");

  useEffect(() => {
    const loadingTimer = setTimeout(
      () => setIsLoadingWallet(false),
      WALLET_LOAD_DELAY_MS,
    );
    return (): void => clearTimeout(loadingTimer);
  }, []);

  useEffect(() => {
    useAppStore.getState().setActiveAccount(activeWalletAddress);
  }, [activeWalletAddress]);

  useEffect(() => {
    const addresses = accountsKey.length > 0 ? accountsKey.split(",") : [];
    const runPoll = (): void => {
      void useAppStore
        .getState()
        .fetchGlobalStats(activeWalletAddress, addresses);
    };
    runPoll();
    const intervalId = setInterval(runPoll, GLOBAL_POLL_INTERVAL_MS);
    return (): void => clearInterval(intervalId);
  }, [activeWalletAddress, accountsKey]);

  /**
   * Locks the wallet by clearing the decrypted session state in React.
   * Does NOT delete the encrypted payload from the persistent electron-store.
   * Also resets the transient AuthFlow UI state back to the initial screen.
   */
  const handleLogout = (): void => {
    useAuthStore.getState().reset();
    setActiveWalletAddress(null);
    setAccounts([]);
    setActiveView(NAV_ITEM_DASHBOARD);
  };

  useAutoLock(handleLogout, activeWalletAddress !== null);

  if (isLoadingWallet) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-accent animate-spin" />
      </div>
    );
  }

  if (!activeWalletAddress) {
    const handleOnboardingComplete = async (address: string): Promise<void> => {
      const storedAccounts =
        (await getSetting<DerivedAccount[]>("accounts")) || [];
      setAccounts(storedAccounts);
      setActiveWalletAddress(address);
    };

    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-accent animate-spin" />
          </div>
        }
      >
        <div className="fixed inset-x-0 top-0 z-50">
          <NodeRecoveryBanner />
        </div>
        <AuthFlow onComplete={(address) => handleOnboardingComplete(address)} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-gray-100 overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <PairingApprovalModal />
        <ToastViewport />
        <Sidebar
          accounts={accounts}
          activeWalletAddress={activeWalletAddress}
          activeView={activeView}
          setActiveView={(view) => handleNavigate(view as ActiveView)}
          onLogout={handleLogout}
          updateStatus={updater.status}
        />

        <main className="flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full w-full">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            {activeView === NAV_ITEM_DASHBOARD && (
              <DashboardPage
                activeWalletAddress={activeWalletAddress}
                accounts={accounts}
                onNavigate={handleNavigate}
              />
            )}
            {activeView === NAV_ITEM_MINER && (
              <Miner
                activeWalletAddress={activeWalletAddress}
                accounts={accounts}
                onNavigate={handleNavigate}
              />
            )}
            {activeView === NAV_ITEM_WALLET && (
              <Wallet
                accounts={accounts}
                setAccounts={setAccounts}
                activeWalletAddress={activeWalletAddress}
                setActiveWalletAddress={setActiveWalletAddress}
              />
            )}
            {activeView === NAV_ITEM_EXPLORER && (
              <Explorer
                activeWalletAddress={activeWalletAddress}
                accounts={accounts}
              />
            )}
            {activeView === NAV_ITEM_SETTINGS && (
              <Settings initialCategory={settingsTab as any} />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default App;
