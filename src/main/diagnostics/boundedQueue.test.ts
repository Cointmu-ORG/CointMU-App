import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ms from "ms";
import { serializeEnvelope, type Envelope } from "@sentry/core";
import { createBoundedQueue } from "./boundedQueue";

const START_MS = 1_700_000_000_000;

function makeEnvelope(id: string, padding = 0): Envelope {
  return [
    { event_id: id },
    [[{ type: "event" }, { event_id: id, message: "x".repeat(padding) }]],
  ] as unknown as Envelope;
}

function eventId(envelope: Envelope | undefined): unknown {
  return envelope?.[0].event_id;
}

describe("createBoundedQueue", () => {
  let dir: string;
  let clockMs: number;
  const now = (): number => clockMs;

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), "cointmu-queue-")), "queue");
    clockMs = START_MS;
  });

  afterEach(async () => {
    await rm(join(dir, ".."), { recursive: true, force: true });
  });

  it("returns envelopes first in, first out", async () => {
    const queue = createBoundedQueue({ dir, now });
    await queue.push(makeEnvelope("a"));
    await queue.push(makeEnvelope("b"));

    expect(eventId(await queue.shift())).toBe("a");
    expect(eventId(await queue.shift())).toBe("b");
    expect(await queue.shift()).toBeUndefined();
  });

  it("puts an unshifted envelope back at the front", async () => {
    const queue = createBoundedQueue({ dir, now });
    await queue.push(makeEnvelope("a"));
    await queue.push(makeEnvelope("b"));
    const first = await queue.shift();

    await queue.unshift(first as Envelope);

    expect(eventId(await queue.shift())).toBe("a");
  });

  it("drops the oldest envelopes when the size cap is exceeded", async () => {
    const oneSize = serializeEnvelope(makeEnvelope("a", 100)).length;
    const queue = createBoundedQueue({ dir, now, maxBytes: oneSize * 2 });

    await queue.push(makeEnvelope("a", 100));
    await queue.push(makeEnvelope("b", 100));
    await queue.push(makeEnvelope("c", 100));

    const ids = (await queue.list()).map((item) => eventId(item.envelope));
    expect(ids).toEqual(["b", "c"]);
  });

  it("drops a single envelope larger than the cap", async () => {
    const queue = createBoundedQueue({ dir, now, maxBytes: 50 });

    await queue.push(makeEnvelope("huge", 500));

    expect(await queue.list()).toEqual([]);
  });

  it("expires envelopes older than the max age", async () => {
    const queue = createBoundedQueue({ dir, now, maxAgeMs: ms("30d") });
    await queue.push(makeEnvelope("old"));
    clockMs += ms("29d");
    await queue.push(makeEnvelope("recent"));
    clockMs += ms("2d");

    expect(eventId(await queue.shift())).toBe("recent");
  });

  it("keeps the original age of an envelope that is retried", async () => {
    const queue = createBoundedQueue({ dir, now, maxAgeMs: ms("30d") });
    await queue.push(makeEnvelope("a"));
    clockMs += ms("29d");
    const retried = await queue.shift();
    await queue.unshift(retried as Envelope);
    clockMs += ms("2d");

    expect(await queue.shift()).toBeUndefined();
  });

  it("lists and clears the queue", async () => {
    const queue = createBoundedQueue({ dir, now });
    await queue.push(makeEnvelope("a"));

    const listed = await queue.list();
    await queue.clear();

    expect(listed).toHaveLength(1);
    expect(listed[0].createdMs).toBe(START_MS);
    expect(await queue.list()).toEqual([]);
    await expect(readdir(dir)).rejects.toThrow();
  });

  it("survives a restart by reading the files back", async () => {
    await createBoundedQueue({ dir, now }).push(makeEnvelope("a"));

    const reopened = createBoundedQueue({ dir, now });

    expect(eventId(await reopened.shift())).toBe("a");
  });
});
