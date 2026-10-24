import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { CustomNetwork } from "@/features/settings";

interface AddNetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (network: CustomNetwork) => void;
}

/**
 * Modal component allowing the user to input and save custom network parameters.
 * @param props - Controls visibility and callbacks.
 * @returns The Add Custom Network modal component.
 */
export function AddNetworkModal({
  isOpen,
  onClose,
  onSave,
}: AddNetworkModalProps): JSX.Element | null {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [chainId, setChainId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSave = (): void => {
    setError("");

    if (!name.trim()) {
      setError(
        t("settings:network.addNetwork.networkNameLabel") + " is required",
      );
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rpcUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Invalid protocol");
      }
    } catch {
      setError(t("settings:network.addNetwork.rpcUrlInvalid"));
      return;
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId) || parsedChainId <= 0) {
      setError(
        t("settings:network.addNetwork.chainIdLabel") +
          " must be a positive number",
      );
      return;
    }

    if (!symbol.trim()) {
      setError(
        t("settings:network.addNetwork.currencySymbolLabel") + " is required",
      );
      return;
    }

    onSave({
      name: name.trim(),
      rpcUrl: rpcUrl.trim(),
      chainId: parsedChainId,
      symbol: symbol.trim().toUpperCase(),
    });

    setName("");
    setRpcUrl("");
    setChainId("");
    setSymbol("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">
            {t("settings:network.addNetwork.modalTitle")}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t("settings:network.addNetwork.networkNameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings:network.addNetwork.examplePlaceholder", {
                example: "Local Ganache",
              })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t("settings:network.addNetwork.rpcUrlLabel")}
            </label>
            <input
              type="text"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="e.g. http://127.0.0.1:8545"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t("settings:network.addNetwork.chainIdLabel")}
            </label>
            <input
              type="number"
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              placeholder="e.g. 1337"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t("settings:network.addNetwork.currencySymbolLabel")}
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={t("settings:network.addNetwork.examplePlaceholder", {
                example: "ETH",
              })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all uppercase"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            {t("settings:network.addNetwork.cancelBtn")}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-colors shadow-sm"
          >
            {t("settings:network.addNetwork.saveBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
