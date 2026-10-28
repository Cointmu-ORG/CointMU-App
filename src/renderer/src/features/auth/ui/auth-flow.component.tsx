import {
  generateMnemonic,
  deriveAccount,
  deriveAccountFromPrivateKey,
  encryptSecret,
  verifyPassword,
  unlockSession,
  ImportKeystoreModal,
  type ImportKeystoreResult,
} from "@/entities/wallet";
import {
  MIN_PASSWORD_LENGTH,
  COPY_FEEDBACK_MS,
} from "../config/auth.constants";
import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, setSetting } from "@/shared/api";
import { useAuthStore } from "../model/auth.store";
import { AuthShell } from "./auth-shell.component";
import { WelcomeStep } from "./welcome-step.component";
import { LoginStep } from "./login-step.component";
import { CreateWalletStep } from "./create-wallet-step.component";
import { ImportWalletStep } from "./import-wallet-step.component";
import { SecureWalletStep } from "./secure-wallet-step.component";

interface AuthFlowProps {
  onComplete: (address: string) => void;
}

/**
 * Secure AuthFlow orchestrator for CointMU Desktop. It owns the wallet
 * generation, recovery, login, and encryption business logic, sources transient
 * wizard state from the AuthFlow store, and routes to the active step
 * sub-component. Secrets are encrypted and verified through the secure crypto IPC
 * service so no plaintext password or mnemonic is ever persisted.
 * @param props - Contains the onComplete callback to update the parent state.
 * @returns The AuthFlow screen component.
 */
export function AuthFlow({ onComplete }: AuthFlowProps): JSX.Element {
  const { t } = useTranslation();
  const step = useAuthStore((s) => s.step);
  const importMethod = useAuthStore((s) => s.importMethod);
  const hasExistingWallet = useAuthStore((s) => s.hasExistingWallet);
  const mnemonic = useAuthStore((s) => s.mnemonic);
  const inputValue = useAuthStore((s) => s.inputValue);
  const password = useAuthStore((s) => s.password);
  const confirmPassword = useAuthStore((s) => s.confirmPassword);

  const setStep = useAuthStore((s) => s.setStep);
  const setHasExistingWallet = useAuthStore((s) => s.setHasExistingWallet);
  const setMnemonic = useAuthStore((s) => s.setMnemonic);
  const setCopied = useAuthStore((s) => s.setCopied);
  const setImportMethod = useAuthStore((s) => s.setImportMethod);
  const setInputValue = useAuthStore((s) => s.setInputValue);
  const setPassword = useAuthStore((s) => s.setPassword);
  const setConfirmPassword = useAuthStore((s) => s.setConfirmPassword);
  const setError = useAuthStore((s) => s.setError);

  const [keystoreJson, setKeystoreJson] = useState<string | null>(null);

  useEffect(() => {
    async function checkExisting(): Promise<void> {
      const encrypted = await getSetting<string | null>("encryptedPayload");
      if (encrypted) {
        setHasExistingWallet(true);
      }
    }
    checkExisting();
  }, [setHasExistingWallet]);

  const handleCopySeed = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  };

  const handleStartCreate = (): void => {
    setMnemonic(generateMnemonic());
    setStep("create-seed");
  };

  const handleStartImport = (): void => {
    setStep("import-method");
  };

  const handleSelectKeystore = async (): Promise<void> => {
    setError(null);
    const result = await window.api.openKeystoreFile({
      title: t("common:dialog.importKeystoreTitle"),
      filterName: t("common:dialog.jsonFilter"),
    });
    if (!result.success || !result.data) return;
    setKeystoreJson(result.data);
  };

  const handleKeystoreImported = ({
    privateKey,
  }: ImportKeystoreResult): void => {
    setImportMethod("privateKey");
    setInputValue(privateKey);
    setKeystoreJson(null);
    resetPasswordFields();
    setStep("import-password");
  };

  const handleLogin = async (): Promise<void> => {
    if (!password) {
      setError(t("auth:errors.enterPassword"));
      return;
    }

    try {
      const encryptedPayload = await getSetting<string | null>(
        "encryptedPayload",
      );
      if (!encryptedPayload) {
        setError(t("auth:errors.corruptedData"));
        return;
      }

      const valid = await verifyPassword(encryptedPayload, password);
      if (!valid) {
        setError(t("auth:errors.invalidPassword"));
        return;
      }

      const activeAddress = await getSetting<string | null>(
        "activeWalletAddress",
      );
      if (activeAddress) {
        unlockSession(password);
        onComplete(activeAddress);
      } else {
        setError(t("auth:errors.corruptedData"));
      }
    } catch {
      setError(t("auth:errors.failedDecrypt"));
    }
  };

  const handleSaveWallet = async (
    secretKey: string,
    isPrivateKey: boolean,
  ): Promise<void> => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth:errors.passwordLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth:errors.passwordsMismatch"));
      return;
    }

    try {
      // The name is stored as the user's own label, so existing accounts keep
      // the language they were created in.
      const label = t("wallet:index.mainAccountLabel");
      const firstAccount = isPrivateKey
        ? deriveAccountFromPrivateKey(secretKey, label)
        : deriveAccount(secretKey, 0, label);

      const encryptedPayload = await encryptSecret(secretKey, password);

      await setSetting("encryptedPayload", encryptedPayload);
      await setSetting("accounts", [firstAccount]);
      await setSetting("activeWalletAddress", firstAccount.address);
      await setSetting("mining.poolAddress", firstAccount.address);

      unlockSession(password);
      onComplete(firstAccount.address);
    } catch {
      setError(t("auth:errors.failedGenerate"));
    }
  };

  const goToInitial = (): void => {
    setStep("initial");
    setPassword("");
    setError(null);
  };

  const resetPasswordFields = (): void => {
    setPassword("");
    setConfirmPassword("");
    setError(null);
  };

  return (
    <>
      <AuthShell step={step} importMethod={importMethod}>
        {step === "initial" && (
          <WelcomeStep
            hasExistingWallet={hasExistingWallet}
            onLogin={() => setStep("login")}
            onCreate={handleStartCreate}
            onImport={handleStartImport}
          />
        )}

        {step === "login" && (
          <LoginStep onUnlock={handleLogin} onBack={goToInitial} />
        )}

        {step === "create-seed" && (
          <CreateWalletStep
            onCopySeed={handleCopySeed}
            onContinue={() => setStep("create-password")}
            onBack={() => setStep("initial")}
          />
        )}

        {step === "create-password" && (
          <SecureWalletStep
            onSave={() => handleSaveWallet(mnemonic, false)}
            onBack={() => {
              setStep("create-seed");
              resetPasswordFields();
            }}
          />
        )}

        {step === "import-method" && (
          <ImportWalletStep
            mode="method"
            onSelectMethod={(method) => {
              setImportMethod(method);
              setStep("import-input");
            }}
            onSelectKeystore={handleSelectKeystore}
            onContinue={() => setStep("import-input")}
            onBackToInitial={() => setStep("initial")}
            onBackToMethod={() => setStep("import-method")}
          />
        )}

        {step === "import-input" && (
          <ImportWalletStep
            mode="input"
            onSelectMethod={setImportMethod}
            onContinue={() => {
              if (!inputValue.trim()) return;
              setStep("import-password");
            }}
            onBackToInitial={() => setStep("initial")}
            onBackToMethod={() => {
              setStep("import-method");
              setInputValue("");
            }}
          />
        )}

        {step === "import-password" && (
          <SecureWalletStep
            onSave={() =>
              handleSaveWallet(inputValue, importMethod === "privateKey")
            }
            onBack={() => {
              setStep("import-input");
              resetPasswordFields();
            }}
          />
        )}
      </AuthShell>

      {keystoreJson && (
        <ImportKeystoreModal
          keystoreJson={keystoreJson}
          onClose={() => setKeystoreJson(null)}
          onImported={handleKeystoreImported}
        />
      )}
    </>
  );
}
