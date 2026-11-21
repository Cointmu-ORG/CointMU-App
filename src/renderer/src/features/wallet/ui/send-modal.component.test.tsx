// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAS_ESTIMATION_DEBOUNCE_MS } from "../config/wallet.constants";
import { useWalletUiStore } from "../model/wallet-ui.store";
import { useAddressNameStore } from "@/entities/address-name";
import { SendModal } from "./send-modal.component";

const wallet = vi.hoisted(() => ({
  resolveWallet: vi.fn(),
  executeNativeTransfer: vi.fn(),
  getSetting: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/entities/account", () => ({ AccountIcon: () => null }));
vi.mock("@/entities/notification", () => ({ dispatchNotification: vi.fn() }));
vi.mock("./token-icon.component", () => ({ TokenIcon: () => null }));
vi.mock("@/shared/ui", () => ({
  CustomDropdown: () => null,
  PrivateAmount: ({ children }: { children: string }) => children,
}));
vi.mock("@/shared/model", () => ({
  useAppStore: (select: (state: object) => unknown) =>
    select({
      addPendingTransaction: vi.fn(),
      removePendingTransaction: vi.fn(),
      fetchGlobalStats: vi.fn(),
    }),
}));
vi.mock("@/shared/api", () => ({
  call: vi.fn().mockResolvedValue("0x1"),
  getSetting: wallet.getSetting,
  waitForTransactionReceipt: vi.fn(() => new Promise(() => undefined)),
}));
const TOKEN = {
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  symbol: "USD",
  name: "Dollar",
  decimals: 6,
  balance: 5_000_000n,
  isAutoDetected: true,
};
const assets = vi.hoisted(() => ({ nativeBalance: 0n }));

vi.mock("../lib/wallet-assets.hook", () => ({
  useWalletAssets: () => ({
    assets: [
      {
        address: "native",
        symbol: "CMU",
        name: "CointMU",
        decimals: 18,
        balance: assets.nativeBalance,
        isAutoDetected: false,
      },
      TOKEN,
    ],
    scan: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/features/wallet", () => ({
  TokenIcon: () => null,
  estimateNativeTransferGas: vi.fn().mockResolvedValue(21000n),
  estimateErc20TransferGas: vi.fn().mockResolvedValue(50000n),
  executeNativeTransfer: wallet.executeNativeTransfer,
  executeErc20Transfer: vi.fn(),
  resolveWallet: wallet.resolveWallet,
  requireSessionPassword: () => "session",
  parseTransferError: (error: Error) => error.message,
}));

const ACCOUNT = {
  index: 0,
  address: "0x1111111111111111111111111111111111111111",
  label: "Main wallet",
};
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const GAS_PRICE_HEX = "0x3b9aca00";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const inputs = (): HTMLInputElement[] =>
  Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="text"]'),
  );
const dialog = (): HTMLFormElement | null =>
  container.querySelector<HTMLFormElement>('[role="dialog"]');
const buttonByText = (text: string): HTMLButtonElement =>
  Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  )!;

function type(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function renderFilledForm(): Promise<void> {
  await act(async () => {
    root.render(
      <SendModal
        activeAccount={ACCOUNT}
        activeWalletAddress={ACCOUNT.address}
        accounts={[ACCOUNT]}
        onDone={vi.fn()}
      />,
    );
  });
  const [recipient, amount] = inputs();
  type(recipient, RECIPIENT);
  type(amount, "1.5");
  // Let the debounced gas estimation run and settle.
  await act(
    () =>
      new Promise((resolve) =>
        setTimeout(resolve, GAS_ESTIMATION_DEBOUNCE_MS * 2),
      ),
  );
}

function click(button: HTMLButtonElement): void {
  act(() => button.click());
}

beforeEach(() => {
  vi.clearAllMocks();
  assets.nativeBalance = 100n * 10n ** 18n;
  wallet.getSetting.mockResolvedValue(undefined);
  useWalletUiStore.getState().resetSendForm();
  useWalletUiStore.setState({ sendGasPrice: GAS_PRICE_HEX });
  useAddressNameStore.setState({ isLoaded: true, names: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SendModal two-step flow", () => {
  it("keeps Continue disabled until the form is valid", async () => {
    await act(async () => {
      root.render(
        <SendModal
          activeAccount={ACCOUNT}
          activeWalletAddress={ACCOUNT.address}
          accounts={[ACCOUNT]}
          onDone={vi.fn()}
        />,
      );
    });

    expect(buttonByText("wallet:modals.send.continueBtn").disabled).toBe(true);
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("returns to the form with every field intact on Back", async () => {
    await renderFilledForm();

    click(buttonByText("wallet:modals.send.continueBtn"));
    expect(dialog()).not.toBeNull();

    click(buttonByText("wallet:modals.sendConfirm.back"));

    expect(dialog()).toBeNull();
    const [recipient, amount] = inputs();
    expect(recipient.value).toBe(RECIPIENT);
    expect(amount.value).toBe("1.5");
    expect(buttonByText("wallet:modals.send.continueBtn").disabled).toBe(false);
  });

  it("stays on the confirm step after a wrong password, sending nothing", async () => {
    wallet.resolveWallet.mockRejectedValue(new Error("Incorrect password."));
    await renderFilledForm();
    click(buttonByText("wallet:modals.send.continueBtn"));
    type(
      container.querySelector<HTMLInputElement>('input[type="password"]')!,
      "wrong",
    );

    await act(async () => dialog()!.requestSubmit());

    expect(dialog()).not.toBeNull();
    expect(container.textContent).toContain("Incorrect password.");
    expect(wallet.executeNativeTransfer).not.toHaveBeenCalled();
    expect(useWalletUiStore.getState().sendLoading).toBe(false);
    expect(useWalletUiStore.getState().sendTo).toBe(RECIPIENT);
  });

  it("labels a named recipient but sends to its exact address", async () => {
    wallet.getSetting.mockResolvedValue(false);
    wallet.resolveWallet.mockResolvedValue({});
    wallet.executeNativeTransfer.mockResolvedValue("0xhash");
    useAddressNameStore.setState({
      isLoaded: true,
      names: { [RECIPIENT]: "Alice" },
    });
    await renderFilledForm();

    expect(container.textContent).toContain("wallet:modals.send.recipientName");
    click(buttonByText("wallet:modals.send.continueBtn"));
    expect(dialog()!.textContent).toContain(`Alice${RECIPIENT}`);
    await act(async () => dialog()!.requestSubmit());

    expect(wallet.executeNativeTransfer).toHaveBeenCalledWith(
      expect.anything(),
      RECIPIENT,
      "1.5",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("skips the password field when the setting is off", async () => {
    wallet.getSetting.mockResolvedValue(false);
    await renderFilledForm();

    click(buttonByText("wallet:modals.send.continueBtn"));

    expect(dialog()).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("refuses a token send when CMU cannot pay the gas, though the token balance can", async () => {
    assets.nativeBalance = 1n;
    useWalletUiStore.setState({ sendSelectedTokenAddress: TOKEN.address });

    await renderFilledForm();

    expect(container.textContent).toContain(
      "wallet:modals.send.errorInsufficientGas",
    );
    expect(buttonByText("wallet:modals.send.continueBtn").disabled).toBe(true);
  });

  it("fills Max with the whole token balance in the token's decimals", async () => {
    useWalletUiStore.setState({ sendSelectedTokenAddress: TOKEN.address });
    await renderFilledForm();

    click(buttonByText("wallet:modals.send.maxBtn"));

    expect(inputs()[1].value).toBe("5");
  });
});
