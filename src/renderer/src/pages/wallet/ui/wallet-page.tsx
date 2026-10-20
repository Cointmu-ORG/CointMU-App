import { COPY_FEEDBACK_MS } from "@/features/wallet";
import { useEffect, useState, type JSX, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  deriveAccount,
  deriveAccountFromPrivateKey,
  encryptSecret,
  decryptSecret,
  getSessionPassword,
  type DerivedAccount,
} from "@/features/wallet";
import { getSetting, setSetting } from "@/features/settings";
import { call } from "@/shared/api";
import { ethers } from "ethers";
import { useAppStore } from "@/shared/model";
import { useWalletUiStore } from "@/features/wallet";
import { WalletHeader } from "@/widgets/wallet-layout";
import { AccountSidebar } from "@/features/wallet";
import { AccountHeroCard } from "@/features/wallet";
import { WalletTabs, type WalletTab } from "@/widgets/wallet-layout";
import { WalletModals } from "@/features/wallet";
import {
  ImportKeystoreModal,
  type ImportKeystoreResult,
} from "@/features/wallet";

interface WalletProps {
  accounts: DerivedAccount[];
  setAccounts: (accounts: DerivedAccount[]) => void;
  activeWalletAddress: string | null;
  setActiveWalletAddress: (address: string) => void;
}

/**
 * Wallet view orchestrator. It owns the account-management and transaction
 * signing business logic, sources transient UI and form state from the wallet UI
 * store, reads the shared balances from the global app store, and composes the
 * layout from focused presentational sub-components.
 * @param props - Account list and setters, and the active address and setter.
 * @returns The complete wallet view with sidebar, hero card, tabs, and modals.
 */
function WalletPage({
  accounts,
  setAccounts,
  activeWalletAddress,
  setActiveWalletAddress,
}: WalletProps): JSX.Element {
  const { t } = useTranslation();
  const balance = useAppStore((s) => s.balance);
  const balances = useAppStore((s) => s.balances);
  const [activeTab, setActiveTab] = useState<WalletTab>("activity");
  const [keystoreJson, setKeystoreJson] = useState<string | null>(null);

  const copied = useWalletUiStore((s) => s.copied);
  const addAccountType = useWalletUiStore((s) => s.addAccountType);
  const importInput = useWalletUiStore((s) => s.importInput);
  const setModalState = useWalletUiStore((s) => s.setModalState);
  const setCopied = useWalletUiStore((s) => s.setCopied);
  const setSendGasPrice = useWalletUiStore((s) => s.setSendGasPrice);
  const setAddAccountError = useWalletUiStore((s) => s.setAddAccountError);
  const resetSendForm = useWalletUiStore((s) => s.resetSendForm);
  const resetAddAccountForm = useWalletUiStore((s) => s.resetAddAccountForm);
  const modalState = useWalletUiStore((s) => s.modalState);

  const activeAccount =
    accounts.find((a) => a.address === activeWalletAddress) || accounts[0];

  useEffect(() => {
    if (modalState === "SEND") {
      resetSendForm();
      call("eth_gasPrice", []).then((price) => {
        if (price) setSendGasPrice(price);
      });
    } else if (modalState === "ADD_ACCOUNT") {
      resetAddAccountForm();
    }
    setCopied(false);
  }, [
    modalState,
    resetSendForm,
    resetAddAccountForm,
    setSendGasPrice,
    setCopied,
  ]);

  const handleAccountSwitch = async (address: string): Promise<void> => {
    await setSetting("activeWalletAddress", address);
    setActiveWalletAddress(address);
  };

  const handleHideAccount = async (
    e: MouseEvent,
    address: string,
  ): Promise<void> => {
    e.stopPropagation();
    if (address === activeWalletAddress) {
      return;
    }
    const updatedAccounts = accounts.map((acc) =>
      acc.address === address ? { ...acc, isHidden: true } : acc,
    );
    await setSetting("accounts", updatedAccounts);
    setAccounts(updatedAccounts);
  };

  const handleUnhideAccount = async (address: string): Promise<void> => {
    const updatedAccounts = accounts.map((acc) =>
      acc.address === address ? { ...acc, isHidden: false } : acc,
    );
    await setSetting("accounts", updatedAccounts);
    setAccounts(updatedAccounts);
  };

  const handleDeleteAccount = async (address: string): Promise<void> => {
    const updatedAccounts = accounts.filter((acc) => acc.address !== address);
    await setSetting("accounts", updatedAccounts);
    setAccounts(updatedAccounts);
  };

  const handleCopy = (): void => {
    if (activeAccount?.address) {
      navigator.clipboard.writeText(activeAccount.address);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    }
  };

  const handleHDDerivation = async (): Promise<void> => {
    try {
      const encryptedPayload = await getSetting<string | null>(
        "encryptedPayload",
      );
      if (!encryptedPayload) throw new Error(t("wallet:index.notUnlocked"));

      const password = getSessionPassword();
      if (!password) throw new Error(t("wallet:index.walletLocked"));

      const secretKey = await decryptSecret(encryptedPayload, password);
      const newIndex = accounts.length;

      let newAccount: DerivedAccount;
      if (secretKey.split(" ").length === 12) {
        newAccount = deriveAccount(
          secretKey,
          newIndex,
          t("wallet:index.accountLabel", { index: newIndex + 1 }),
        );
      } else {
        const randomWallet = ethers.Wallet.createRandom();
        newAccount = deriveAccountFromPrivateKey(
          randomWallet.privateKey,
          t("wallet:index.accountLabel", { index: newIndex + 1 }),
        );
        newAccount.encryptedKey = await encryptSecret(
          randomWallet.privateKey,
          password,
        );
      }

      const updatedAccounts = [...accounts, newAccount];
      await setSetting("accounts", updatedAccounts);
      setAccounts(updatedAccounts);
      await handleAccountSwitch(newAccount.address);
    } catch (e) {
      // Message only: the error object may carry ethers argument values from
      // the decrypted phrase or key handled above.
      console.error(
        "[wallet] Account derivation failed:",
        e instanceof Error ? e.message : "unknown error",
      );
    }
  };

  const handleCreateOrImportAccount = async (): Promise<void> => {
    try {
      setAddAccountError("");
      let newAccount: DerivedAccount;
      const password = getSessionPassword();
      if (!password) throw new Error(t("wallet:index.walletLocked"));

      if (addAccountType === "IMPORT_PK") {
        const pk =
          !importInput.startsWith("0x") && importInput.length === 64
            ? "0x" + importInput
            : importInput;
        newAccount = deriveAccountFromPrivateKey(
          pk,
          t("wallet:index.importedAccount"),
        );
        newAccount.encryptedKey = await encryptSecret(pk, password);
      } else if (addAccountType === "IMPORT_SEED") {
        newAccount = deriveAccount(
          importInput,
          0,
          t("wallet:index.importedSeedAccount"),
        );
        newAccount.encryptedKey = await encryptSecret(importInput, password);
      } else {
        return;
      }

      const updatedAccounts = [...accounts, newAccount];
      await setSetting("accounts", updatedAccounts);
      setAccounts(updatedAccounts);

      await handleAccountSwitch(newAccount.address);
      setModalState("NONE");
    } catch (e) {
      setAddAccountError(
        e instanceof Error ? e.message : t("wallet:index.failedToAdd"),
      );
    }
  };

  const handleImportKeystoreFile = async (): Promise<void> => {
    setModalState("NONE");
    const result = await window.api.openKeystoreFile();
    if (!result.success || !result.data) return;
    setKeystoreJson(result.data);
  };

  const handleKeystoreImported = async ({
    privateKey,
    address,
  }: ImportKeystoreResult): Promise<void> => {
    setKeystoreJson(null);
    const password = getSessionPassword();
    if (!password) return;

    const existing = accounts.find(
      (a) => a.address.toLowerCase() === address.toLowerCase(),
    );
    if (existing) {
      await handleAccountSwitch(existing.address);
      return;
    }

    const newAccount = deriveAccountFromPrivateKey(
      privateKey,
      t("wallet:index.importedAccount"),
    );
    newAccount.encryptedKey = await encryptSecret(privateKey, password);

    const updatedAccounts = [...accounts, newAccount];
    await setSetting("accounts", updatedAccounts);
    setAccounts(updatedAccounts);
    await handleAccountSwitch(newAccount.address);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/80 dark:bg-gray-950 dark:text-white relative">
      <WalletHeader onAddAccount={() => setModalState("ADD_ACCOUNT")} />

      <main className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="flex gap-6 h-full">
          <AccountSidebar
            accounts={accounts}
            activeWalletAddress={activeWalletAddress}
            balances={balances}
            onAccountSwitch={handleAccountSwitch}
            onHideAccount={handleHideAccount}
            onDeriveAccount={handleHDDerivation}
            onImportWallet={() => {
              setModalState("ADD_ACCOUNT");
              useWalletUiStore.getState().setAddAccountType("IMPORT_PK");
            }}
            onManageHidden={() => setModalState("MANAGE_HIDDEN")}
          />

          <div className="flex-1 min-w-0 space-y-5">
            <AccountHeroCard
              activeAccount={activeAccount}
              balance={balance}
              copied={copied}
              onReceive={() => setModalState("RECEIVE")}
              onSend={() => setModalState("SEND")}
              onCopy={handleCopy}
            />

            <WalletTabs
              activeWalletAddress={activeWalletAddress}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      </main>

      <WalletModals
        accounts={accounts}
        activeAccount={activeAccount}
        activeWalletAddress={activeWalletAddress}
        balances={balances}
        copied={copied}
        onClose={() => setModalState("NONE")}
        onCopy={handleCopy}
        onImportAccount={handleCreateOrImportAccount}
        onImportKeystore={handleImportKeystoreFile}
        onUnhideAccount={handleUnhideAccount}
        onDeleteAccount={handleDeleteAccount}
      />

      {keystoreJson && (
        <ImportKeystoreModal
          keystoreJson={keystoreJson}
          onClose={() => setKeystoreJson(null)}
          onImported={handleKeystoreImported}
        />
      )}
    </div>
  );
}

export { WalletPage };
