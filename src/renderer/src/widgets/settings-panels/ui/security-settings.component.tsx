import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { useSecurityStore } from "@/features/settings";
import { ShieldCheck } from "lucide-react";
import { RevealPrivateKeyModal } from "./reveal-private-key-modal.component";
import { RecoveryPhraseModal } from "./recovery-phrase-modal.component";
import { ExportKeystoreModal } from "./export-keystore-modal.component";
import { ResetWalletModal } from "./reset-wallet-modal.component";

// No device support yet (#106): the rows only announce it.
const HARDWARE_WALLETS = ["Ledger", "Trezor"] as const;

interface ToggleProps {
  value: boolean;
  onChange: () => void;
}

/**
 * Pill-switch toggle for the auto-lock preference.
 * @param props - The current value and the change handler.
 * @returns The rendered toggle button.
 */
function Toggle({ value, onChange }: ToggleProps): JSX.Element {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${value ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${value ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

/**
 * Security settings pane. Self-contained: the auto-lock preference comes from
 * the security store, and the recovery, keystore-export, private-key, and
 * reset flows each open a dedicated password-gated modal. The biometric
 * signing toggle is hidden until signing checks it (#104); its stored value
 * is kept.
 * @returns The Security Settings form component.
 */
export function SecuritySettings(): JSX.Element {
  const { t } = useTranslation();
  const settings = useSecurityStore((s) => s.settings);
  const toggleAutoLock = useSecurityStore((s) => s.toggleAutoLock);

  const [showReveal, setShowReveal] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showReset, setShowReset] = useState(false);

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:securitySettings.subtitle")}
      </h2>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:securitySettings.access")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:securitySettings.autoLockTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:securitySettings.autoLockDesc")}
                </p>
              </div>
              <Toggle value={settings.autoLock} onChange={toggleAutoLock} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:securitySettings.backup")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
                    <ShieldCheck
                      className="text-emerald-500"
                      width={16}
                      height={16}
                    />
                    {t("settings:securitySettings.seedPhraseTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                    {t("settings:securitySettings.seedPhraseDesc")}
                  </p>
                </div>
                <button
                  onClick={() => setShowRecovery(true)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
                >
                  {t("settings:securitySettings.reveal")}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:securitySettings.exportTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:securitySettings.exportDesc")}
                </p>
              </div>
              <button
                onClick={() => setShowExport(true)}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
              >
                {t("settings:securitySettings.export")}
              </button>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:securitySettings.privateKeyTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:securitySettings.privateKeyDesc")}
                </p>
              </div>
              <button
                onClick={() => setShowReveal(true)}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
              >
                {t("settings:securitySettings.reveal")}
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:securitySettings.hardware")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            {HARDWARE_WALLETS.map((device) => (
              <div
                key={device}
                className="flex items-center justify-between p-4"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {device}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:securitySettings.hardwareDesc", { device })}
                  </p>
                </div>
                <button
                  disabled
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 shadow-sm opacity-50 cursor-not-allowed"
                >
                  {t("settings:securitySettings.comingSoon")}
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between p-4 mt-6 border-t border-slate-200 dark:border-gray-800">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:securitySettings.resetWalletTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:securitySettings.resetWalletDesc")}
                </p>
              </div>
              <button
                onClick={() => setShowReset(true)}
                className="px-3 py-1.5 bg-red-500 text-white border border-red-600 rounded-lg text-xs font-bold hover:bg-red-600 shadow-sm transition-colors"
              >
                {t("settings:securitySettings.resetWalletBtn")}
              </button>
            </div>
          </div>
        </section>
      </div>

      {showReveal && (
        <RevealPrivateKeyModal onClose={() => setShowReveal(false)} />
      )}
      {showRecovery && (
        <RecoveryPhraseModal onClose={() => setShowRecovery(false)} />
      )}
      {showExport && (
        <ExportKeystoreModal onClose={() => setShowExport(false)} />
      )}
      {showReset && <ResetWalletModal onClose={() => setShowReset(false)} />}
    </div>
  );
}
