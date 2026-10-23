import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllSettings } from "./settings.service";

describe("resetAllSettings", () => {
  const order: string[] = [];
  const set = vi.fn(async (key: string) => {
    order.push(`set:${key}`);
  });
  const reset = vi.fn(async () => {
    order.push("bootnode:reset");
  });

  beforeEach(() => {
    order.length = 0;
    set.mockClear();
    reset.mockClear();
    vi.stubGlobal("window", {
      api: { settings: { set }, bootnode: { reset } },
    });
  });

  it("never writes the network object, which would replace the bootnodes", async () => {
    await resetAllSettings();

    const keys = set.mock.calls.map(([key]) => key);
    expect(keys).not.toContain("network");
    expect(keys).not.toContain("network.bootnodes");
    expect(set).toHaveBeenCalledWith("network.network", "CointMU Mainnet");
    expect(set).toHaveBeenCalledWith("network.listenPort", 30303);
    expect(set).toHaveBeenCalledWith("network.customNetworks", []);
  });

  it("clears the bootnodes through the bootnode channel, after the other writes", async () => {
    await resetAllSettings();

    expect(reset).toHaveBeenCalledOnce();
    expect(order.at(-1)).toBe("bootnode:reset");
  });

  it("fails when a write is refused, instead of reporting a partial reset as done", async () => {
    set.mockRejectedValueOnce(new Error("refused"));

    await expect(resetAllSettings()).rejects.toThrow("refused");
  });
});
