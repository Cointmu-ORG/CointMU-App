import { create } from "zustand";

type WalletModalState =
  "NONE" | "RECEIVE" | "SEND" | "ADD_ACCOUNT" | "MANAGE_HIDDEN";
type AddAccountType = "SELECT" | "CREATE" | "IMPORT_SEED" | "IMPORT_PK";

interface WalletUiStore {
  modalState: WalletModalState;
  copied: boolean;
  sendTo: string;
  sendAmount: string;
  sendGasPrice: string;
  sendSelectedTokenAddress: string;
  sendLoading: boolean;
  sendError: string;
  sendSuccess: string;
  addAccountType: AddAccountType;
  importInput: string;
  addAccountError: string;
  setModalState: (modal: WalletModalState) => void;
  setCopied: (copied: boolean) => void;
  setSendTo: (value: string) => void;
  setSendAmount: (value: string) => void;
  setSendGasPrice: (value: string) => void;
  setSendSelectedTokenAddress: (value: string) => void;
  setSendLoading: (value: boolean) => void;
  setSendError: (value: string) => void;
  setSendSuccess: (value: string) => void;
  setAddAccountType: (value: AddAccountType) => void;
  setImportInput: (value: string) => void;
  setAddAccountError: (value: string) => void;
  resetSendForm: () => void;
  resetAddAccountForm: () => void;
}

/**
 * Holds the transient wallet UI and form state shared between the wallet view
 * and its modal sub-components. Centralizing this state here removes the need to
 * drill a large set of value and setter props into each modal, while the wallet
 * orchestrator retains the signing and account-management business logic.
 */
export const useWalletUiStore = create<WalletUiStore>((set) => ({
  modalState: "NONE",
  copied: false,
  sendTo: "",
  sendAmount: "",
  sendGasPrice: "0",
  sendSelectedTokenAddress: "native",
  sendLoading: false,
  sendError: "",
  sendSuccess: "",
  addAccountType: "SELECT",
  importInput: "",
  addAccountError: "",
  setModalState: (modalState) => set({ modalState }),
  setCopied: (copied) => set({ copied }),
  setSendTo: (sendTo) => set({ sendTo }),
  setSendAmount: (sendAmount) => set({ sendAmount }),
  setSendGasPrice: (sendGasPrice) => set({ sendGasPrice }),
  setSendSelectedTokenAddress: (sendSelectedTokenAddress) =>
    set({ sendSelectedTokenAddress }),
  setSendLoading: (sendLoading) => set({ sendLoading }),
  setSendError: (sendError) => set({ sendError }),
  setSendSuccess: (sendSuccess) => set({ sendSuccess }),
  setAddAccountType: (addAccountType) => set({ addAccountType }),
  setImportInput: (importInput) => set({ importInput }),
  setAddAccountError: (addAccountError) => set({ addAccountError }),
  resetSendForm: () =>
    set({
      sendTo: "",
      sendAmount: "",
      sendError: "",
      sendSuccess: "",
      sendLoading: false,
      sendSelectedTokenAddress: "native",
    }),
  resetAddAccountForm: () =>
    set({ addAccountType: "SELECT", importInput: "", addAccountError: "" }),
}));

export type { WalletModalState, AddAccountType };
