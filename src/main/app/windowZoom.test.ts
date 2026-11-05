import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { applyStoredZoom } from "./windowZoom";

function fakes(stored: unknown) {
  let onChange: () => void = () => {};
  let onLoad: () => void = () => {};
  const store = {
    value: stored,
    get: vi.fn(function (this: { value: unknown }) {
      return this.value;
    }),
    onDidChange: vi.fn((_key: string, listener: () => void) => {
      onChange = listener;
    }),
  };
  const setZoomFactor = vi.fn();
  const win = {
    isDestroyed: () => false,
    webContents: {
      setZoomFactor,
      on: vi.fn((_event: string, listener: () => void) => {
        onLoad = listener;
      }),
    },
  } as unknown as BrowserWindow;
  return {
    store,
    win,
    setZoomFactor,
    change: () => onChange(),
    load: () => onLoad(),
  };
}

describe("applyStoredZoom", () => {
  it("applies the stored zoom now, after a load and on a change", () => {
    const { store, win, setZoomFactor, change, load } = fakes(110);

    applyStoredZoom(store, win);
    expect(setZoomFactor).toHaveBeenLastCalledWith(1.1);

    store.value = 125;
    change();
    expect(setZoomFactor).toHaveBeenLastCalledWith(1.25);

    load();
    expect(setZoomFactor).toHaveBeenCalledTimes(3);
  });

  it("uses 100% when nothing usable is stored", () => {
    const { store, win, setZoomFactor } = fakes(undefined);

    applyStoredZoom(store, win);

    expect(setZoomFactor).toHaveBeenCalledWith(1);
  });
});
