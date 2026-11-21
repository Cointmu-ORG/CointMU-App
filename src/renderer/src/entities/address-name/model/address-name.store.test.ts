import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSetting, setSetting } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/shared/api", () => ({ getSetting, setSetting }));

import { useAddressNameStore } from "./address-name.store";

const INITIAL_STATE = useAddressNameStore.getState();
const ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MIXED_CASE = "0xAaAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA";

beforeEach(() => {
  useAddressNameStore.setState(INITIAL_STATE, true);
  getSetting.mockReset();
  setSetting.mockReset().mockResolvedValue(undefined);
});

describe("address name store", () => {
  it("saves a name under the lowercase address and persists the whole map", async () => {
    await useAddressNameStore.getState().save(MIXED_CASE, "Alice");

    expect(setSetting).toHaveBeenCalledWith("addressNames", {
      [MIXED_CASE.toLowerCase()]: "Alice",
    });
    expect(useAddressNameStore.getState().names).toEqual({
      [MIXED_CASE.toLowerCase()]: "Alice",
    });
  });

  it("keeps the old names when main refuses the write", async () => {
    useAddressNameStore.setState({ names: { [ADDRESS]: "Alice" } });
    setSetting.mockRejectedValue(new TypeError("rejected"));

    await expect(
      useAddressNameStore.getState().save(ADDRESS, "Bob"),
    ).rejects.toThrow("rejected");
    expect(useAddressNameStore.getState().names).toEqual({
      [ADDRESS]: "Alice",
    });
  });

  it("refuses to save a name for something that is not an address", async () => {
    await expect(
      useAddressNameStore.getState().save("alice.eth", "Alice"),
    ).rejects.toThrow(TypeError);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("removes a name", async () => {
    useAddressNameStore.setState({ names: { [ADDRESS]: "Alice" } });

    await useAddressNameStore.getState().remove(MIXED_CASE);

    expect(setSetting).toHaveBeenCalledWith("addressNames", {});
    expect(useAddressNameStore.getState().names).toEqual({});
  });

  it("loads stored names and ignores an invalid stored map", async () => {
    getSetting.mockResolvedValueOnce({ [ADDRESS]: "Alice" });
    useAddressNameStore.getState().ensureLoaded();
    await vi.waitFor(() =>
      expect(useAddressNameStore.getState().names).toEqual({
        [ADDRESS]: "Alice",
      }),
    );

    useAddressNameStore.setState(INITIAL_STATE, true);
    getSetting.mockResolvedValueOnce({ [ADDRESS]: 42 });
    useAddressNameStore.getState().ensureLoaded();
    await vi.waitFor(() => expect(getSetting).toHaveBeenCalledTimes(2));
    expect(useAddressNameStore.getState().names).toEqual({});
  });
});
