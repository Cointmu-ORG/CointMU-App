// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SendConfirmResult,
  SendSummary,
} from "../model/send-confirm.types";
import { SendConfirmModal } from "./send-confirm-modal.component";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/entities/account", () => ({ AccountIcon: () => null }));
vi.mock("./token-icon.component", () => ({ TokenIcon: () => null }));

const SUMMARY: SendSummary = {
  fromLabel: "Main wallet",
  fromAddress: "0x1111111111111111111111111111111111111111",
  toAddress: "0x2222222222222222222222222222222222222222",
  amount: "1.5",
  symbol: "CMU",
  tokenAddress: "native",
  feeCmu: "0.00002100",
  isNative: true,
};
const WRONG_PASSWORD = "Incorrect password.";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

interface RenderOptions {
  isPasswordRequired: boolean;
  onConfirm: (password: string) => Promise<SendConfirmResult>;
  onBack?: () => void;
}

function render({
  isPasswordRequired,
  onConfirm,
  onBack,
}: RenderOptions): void {
  act(() => {
    root.render(
      <SendConfirmModal
        summary={SUMMARY}
        isPasswordRequired={isPasswordRequired}
        onBack={onBack ?? vi.fn()}
        onConfirm={onConfirm}
      />,
    );
  });
}

const dialog = (): HTMLFormElement | null =>
  container.querySelector<HTMLFormElement>('[role="dialog"]');
const passwordInput = (): HTMLInputElement | null =>
  container.querySelector<HTMLInputElement>('input[type="password"]');
const confirmButton = (): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>('button[type="submit"]')!;

function typePassword(value: string): void {
  const input = passwordInput()!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(): Promise<void> {
  await act(async () => {
    dialog()!.requestSubmit();
  });
}

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SendConfirmModal", () => {
  it("shows the full recipient and the real amount", () => {
    render({ isPasswordRequired: true, onConfirm: vi.fn() });

    expect(container.textContent).toContain(SUMMARY.toAddress);
    expect(container.textContent).toContain("1.5");
    expect(container.textContent).toContain("1.500021 CMU");
  });

  it("has no password field when the setting is off, and focuses confirm", () => {
    render({ isPasswordRequired: false, onConfirm: vi.fn() });

    expect(passwordInput()).toBeNull();
    expect(document.activeElement).toBe(confirmButton());
  });

  it("focuses the password field when the setting is on", () => {
    render({ isPasswordRequired: true, onConfirm: vi.fn() });

    expect(document.activeElement).toBe(passwordInput());
  });

  it("stays open on a wrong password, clears it, and hides the error on typing", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      isOk: false,
      field: "password",
      message: WRONG_PASSWORD,
    });
    render({ isPasswordRequired: true, onConfirm });
    typePassword("nope");

    await submit();

    expect(onConfirm).toHaveBeenCalledWith("nope");
    expect(dialog()).not.toBeNull();
    expect(passwordInput()!.value).toBe("");
    expect(passwordInput()!.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain(WRONG_PASSWORD);

    typePassword("n");

    expect(container.textContent).not.toContain(WRONG_PASSWORD);
  });

  it("does not submit an empty password", async () => {
    const onConfirm = vi.fn();
    render({ isPasswordRequired: true, onConfirm });

    await submit();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "wallet:modals.send.passwordRequired",
    );
  });

  it("submits once while sending, disables the buttons and ignores Escape", async () => {
    let finish: (result: SendConfirmResult) => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<SendConfirmResult>((resolve) => {
          finish = resolve;
        }),
    );
    const onBack = vi.fn();
    render({ isPasswordRequired: true, onConfirm, onBack });
    typePassword("secret");

    await submit();
    await submit();
    pressEscape();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent).toBe(
      "wallet:modals.sendConfirm.sending",
    );
    expect(passwordInput()!.disabled).toBe(true);

    await act(async () => finish({ isOk: true }));

    expect(passwordInput()!.value).toBe("");
  });

  it("goes back on Escape when idle", () => {
    const onBack = vi.fn();
    render({ isPasswordRequired: false, onConfirm: vi.fn(), onBack });

    pressEscape();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows a non-password failure above the buttons and stays open", async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      isOk: false,
      field: "general",
      message: "Node rejected the transaction.",
    });
    render({ isPasswordRequired: false, onConfirm });

    await submit();

    expect(dialog()).not.toBeNull();
    expect(container.textContent).toContain("Node rejected the transaction.");
  });
});
