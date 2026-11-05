import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

import { ipcMain } from "electron";
import { MinerRange } from "../../bridge/types";
import {
  answerMinerDistribution,
  registerExplorerHandlers,
  type ExplorerIndexQueries,
} from "./explorerIpc";

function queries(): ExplorerIndexQueries {
  return {
    minerDistribution: vi.fn(async () => null),
    status: vi.fn(async () => null),
    rebuild: vi.fn(),
  };
}

describe("answerMinerDistribution", () => {
  it.each(["weekly", "", 7, null, undefined, { range: "week" }])(
    "rejects the payload %j without asking the index",
    (payload) => {
      const index = queries();

      expect(() => answerMinerDistribution(index, payload)).toThrow(TypeError);
      expect(index.minerDistribution).not.toHaveBeenCalled();
    },
  );

  it("passes a valid range to the index", async () => {
    const index = queries();

    expect(await answerMinerDistribution(index, MinerRange.MONTH)).toBeNull();
    expect(index.minerDistribution).toHaveBeenCalledWith(MinerRange.MONTH);
  });
});

describe("explorer:rebuild-index", () => {
  it("asks the index to rebuild", async () => {
    const index = queries();
    registerExplorerHandlers(index);
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === "explorer:rebuild-index",
      )?.[1];

    await handler?.({} as Electron.IpcMainInvokeEvent);

    expect(index.rebuild).toHaveBeenCalledOnce();
  });
});
