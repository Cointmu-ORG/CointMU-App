// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountLabelEditor } from "./account-label-editor.component";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const button = (label: string): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const input = (): HTMLInputElement | null => container.querySelector("input");

function type(value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setValue.call(input(), value);
    input()!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function render(onRename: (label: string) => Promise<void>): void {
  act(() =>
    root.render(<AccountLabelEditor label="Account 1" onRename={onRename} />),
  );
  act(() => button("wallet:accountLabel.edit").click());
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

describe("AccountLabelEditor", () => {
  it("saves the trimmed label and closes the form", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    render(onRename);

    type("  Savings  ");
    await act(async () => button("wallet:accountLabel.save").click());

    expect(onRename).toHaveBeenCalledWith("Savings");
    expect(input()).toBeNull();
  });

  it("refuses an empty label without saving", async () => {
    const onRename = vi.fn();
    render(onRename);

    type("   ");
    await act(async () => button("wallet:accountLabel.save").click());

    expect(onRename).not.toHaveBeenCalled();
    expect(container.textContent).toContain("wallet:accountLabel.invalid");
  });

  it("stays open with an error when the save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(vi.fn().mockRejectedValue(new Error("disk")));

    type("Savings");
    await act(async () => button("wallet:accountLabel.save").click());

    expect(input()).not.toBeNull();
    expect(container.textContent).toContain("wallet:accountLabel.saveFailed");
  });

  it("cancels on Escape", () => {
    render(vi.fn());

    act(() => {
      input()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(input()).toBeNull();
    expect(container.textContent).toContain("Account 1");
  });
});
