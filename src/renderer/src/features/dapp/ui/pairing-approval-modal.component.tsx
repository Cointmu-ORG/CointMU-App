import { useState, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";

/**
 * Modal to ask for user approval when the extension requests to link
 * to the desktop app. It appears based on IPC events.
 * @returns {JSX.Element | null} The modal or null.
 */
export function PairingApprovalModal(): JSX.Element | null {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const removeListener = window.api.pairing.onRequest(() => {
      setIsVisible(true);
    });
    return () => removeListener();
  }, []);

  if (!isVisible) return null;

  const handleApprove = () => {
    window.api.pairing.respond(true);
    setIsVisible(false);
  };

  const handleReject = () => {
    window.api.pairing.respond(false);
    setIsVisible(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backdropFilter: "blur(4px)",
        backgroundColor: "rgba(0,0,0,0.45)",
      }}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {t("ui:pairing.pairingRequest")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-xs font-semibold text-amber-700">
              Pending
            </span>
          </div>
        </div>

        <div className="px-5 py-6 space-y-4 text-center">
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            {t("ui:pairing.pairingDesc")}
          </p>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={handleReject}
            className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors duration-150"
          >
            {t("ui:pairing.reject")}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors duration-150 shadow-sm"
          >
            {t("ui:pairing.approve")}
          </button>
        </div>
      </div>
    </div>
  );
}
