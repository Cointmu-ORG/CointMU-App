import { describe, expect, it, vi } from "vitest";
import { ClipboardGuard } from "./clipboardGuard";

function fakeClipboard() {
  const timers: Array<{ run: () => void; isCancelled: boolean }> = [];
  const board = {
    text: "",
    readText: async () => board.text,
    writeText: async (text: string) => {
      board.text = text;
    },
    clear: vi.fn(() => {
      board.text = "";
    }),
    setTimer: vi.fn((run: () => void) => {
      const timer = { run, isCancelled: false };
      timers.push(timer);
      return () => {
        timer.isCancelled = true;
      };
    }),
    elapse: async () => {
      timers.filter((timer) => !timer.isCancelled).forEach((t) => t.run());
      await Promise.resolve();
    },
  };
  return board;
}

const ADDRESS = "0x2BC096C7573c73f896DFb3fbb3b9BEa1C8FCE797";

describe("ClipboardGuard", () => {
  it("clears what it copied after the delay", async () => {
    const board = fakeClipboard();
    await new ClipboardGuard(board).copy(ADDRESS, 30);

    expect(board.text).toBe(ADDRESS);
    expect(board.setTimer).toHaveBeenCalledWith(expect.any(Function), 30_000);
    await board.elapse();

    expect(board.clear).toHaveBeenCalledOnce();
    expect(board.text).toBe("");
  });

  it("leaves the clipboard alone when the user copied something else", async () => {
    const board = fakeClipboard();
    await new ClipboardGuard(board).copy(ADDRESS, 30);

    await board.writeText("the user's own note");
    await board.elapse();

    expect(board.clear).not.toHaveBeenCalled();
    expect(board.text).toBe("the user's own note");
  });

  it("never clears when set to Never (0)", async () => {
    const board = fakeClipboard();
    await new ClipboardGuard(board).copy(ADDRESS, 0);

    expect(board.setTimer).not.toHaveBeenCalled();
    expect(board.text).toBe(ADDRESS);
  });

  it("restarts the delay for a newer copy", async () => {
    const board = fakeClipboard();
    const guard = new ClipboardGuard(board);
    await guard.copy(ADDRESS, 30);
    await guard.copy("0xkey", 30);

    await board.elapse();

    expect(board.clear).toHaveBeenCalledOnce();
    expect(board.text).toBe("");
  });
});
