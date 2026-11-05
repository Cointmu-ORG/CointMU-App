import { describe, expect, it, vi } from "vitest";

vi.mock("@/entities/notification", () => ({ dispatchNotification: vi.fn() }));
vi.mock("@/shared/api", () => ({ call: vi.fn(), getSetting: vi.fn() }));
vi.mock("@/shared/model", () => ({ useAppStore: vi.fn() }));

const { MAX_BLOCKS_PER_CHECK, newBlockNumbers, ownBlocks } =
  await import("./block-found-notifications.hook");

describe("newBlockNumbers", () => {
  it("starts watching without notifying older blocks", () => {
    expect(newBlockNumbers(null, 500)).toEqual([]);
  });

  it("lists the blocks since the last check", () => {
    expect(newBlockNumbers(500, 503)).toEqual([501, 502, 503]);
    expect(newBlockNumbers(503, 503)).toEqual([]);
    expect(newBlockNumbers(503, 490)).toEqual([]);
  });

  it("caps a long gap to the newest blocks", () => {
    const numbers = newBlockNumbers(100, 1000);

    expect(numbers).toHaveLength(MAX_BLOCKS_PER_CHECK);
    expect(numbers.at(-1)).toBe(1000);
  });
});

describe("ownBlocks", () => {
  const COINBASE = "0x2BC096C7573c73f896DFb3fbb3b9BEa1C8FCE797";
  const blocks = [
    { number: 1, hash: "0xa", miner: COINBASE.toLowerCase() },
    {
      number: 2,
      hash: "0xb",
      miner: "0x0000000000000000000000000000000000000001",
    },
  ];

  it("matches our coinbase whatever the address case", () => {
    expect(ownBlocks(blocks, [COINBASE])).toEqual([blocks[0]]);
  });

  it("finds nothing for someone else's blocks", () => {
    expect(
      ownBlocks(blocks, ["0x00000000000000000000000000000000000000ff"]),
    ).toEqual([]);
  });
});
