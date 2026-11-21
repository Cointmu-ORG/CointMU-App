// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setSetting } = vi.hoisted(() => ({ setSetting: vi.fn() }));
vi.mock("@/shared/api", () => ({ getSetting: vi.fn(), setSetting }));
vi.mock("@/entities/account", () => ({ AccountIcon: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useAddressNameStore } from "@/entities/address-name";
import { AddressNamesModal } from "./address-names-modal.component";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OWN = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

let container: HTMLDivElement;
let root: Root;

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

async function submit(address: string, name: string): Promise<void> {
  const [addressInput, nameInput] = Array.from(
    container.querySelectorAll("input"),
  );
  type(addressInput, address);
  type(nameInput, name);
  await act(async () => container.querySelector("form")!.requestSubmit());
}

beforeEach(() => {
  setSetting.mockReset().mockResolvedValue(undefined);
  useAddressNameStore.setState({ isLoaded: true, names: {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AddressNamesModal ownAddresses={[OWN]} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AddressNamesModal", () => {
  it("adds a name and lists it with the full address", async () => {
    await submit(OTHER, " Alice ");

    expect(setSetting).toHaveBeenCalledWith("addressNames", {
      [OTHER]: "Alice",
    });
    expect(container.textContent).toContain(`Alice${OTHER}`);
  });

  it("refuses one of the wallet's own accounts", async () => {
    await submit(OWN, "Me");

    expect(setSetting).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "wallet:modals.addressNames.errors.ownAccount",
    );
  });

  it("removes a name", async () => {
    act(() => useAddressNameStore.setState({ names: { [OTHER]: "Alice" } }));

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="wallet:modals.addressNames.remove"]',
        )!
        .click(),
    );

    expect(setSetting).toHaveBeenCalledWith("addressNames", {});
    expect(container.textContent).toContain("wallet:modals.addressNames.empty");
  });
});
