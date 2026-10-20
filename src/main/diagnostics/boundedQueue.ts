import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import ms from "ms";
import {
  parseEnvelope,
  serializeEnvelope,
  type Envelope,
  type OfflineStore,
} from "@sentry/core";

export const QUEUE_MAX_BYTES = 5 * 1024 * 1024;
export const QUEUE_MAX_AGE_MS = ms("30d");
const FILE_SUFFIX = ".envelope";
/** `<order>_<createdMs>.envelope`: order sorts the queue, createdMs ages it. */
const FILE_NAME_PATTERN = /^(\d+)_(\d+)\.envelope$/;

export interface BoundedQueueOptions {
  readonly dir: string;
  readonly maxBytes?: number;
  readonly maxAgeMs?: number;
  readonly now?: () => number;
}

export interface QueuedEnvelope {
  readonly id: string;
  readonly createdMs: number;
  readonly envelope: Envelope;
}

interface Entry {
  readonly name: string;
  readonly order: number;
  readonly createdMs: number;
  readonly bytes: number;
}

export interface BoundedQueue extends OfflineStore {
  list(): Promise<QueuedEnvelope[]>;
  clear(): Promise<void>;
}

/**
 * File-backed offline store for the Sentry offline transport: one file per
 * envelope in `dir`, capped by total size and age. When the cap is hit the
 * oldest envelopes are dropped first. Operations run one at a time.
 * @param options - Directory, limits, and an injectable clock for tests.
 * @returns The queue, usable as `createStore` and for the settings UI.
 */
export function createBoundedQueue(options: BoundedQueueOptions): BoundedQueue {
  const {
    dir,
    maxBytes = QUEUE_MAX_BYTES,
    maxAgeMs = QUEUE_MAX_AGE_MS,
    now = Date.now,
  } = options;
  let tail: Promise<unknown> = Promise.resolve();
  let lastOrder = 0;
  let lastShiftedCreatedMs: number | undefined;

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };

  async function readEntries(): Promise<Entry[]> {
    const names = await readdir(dir).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return [];
      throw err;
    });
    const entries: Entry[] = [];
    for (const name of names) {
      const match = FILE_NAME_PATTERN.exec(name);
      if (!match) continue;
      const { size } = await stat(join(dir, name));
      entries.push({
        name,
        order: Number(match[1]),
        createdMs: Number(match[2]),
        bytes: size,
      });
    }
    return entries.sort((a, b) => a.order - b.order);
  }

  const remove = (name: string): Promise<void> =>
    rm(join(dir, name), { force: true });

  /** Drops expired entries, then the oldest ones until the queue fits. */
  async function prune(): Promise<Entry[]> {
    const cutoff = now() - maxAgeMs;
    const entries: Entry[] = [];
    for (const entry of await readEntries()) {
      if (entry.createdMs < cutoff) await remove(entry.name);
      else entries.push(entry);
    }
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    while (total > maxBytes && entries.length > 0) {
      const oldest = entries.shift() as Entry;
      total -= oldest.bytes;
      await remove(oldest.name);
    }
    return entries;
  }

  async function write(
    envelope: Envelope,
    order: number,
    createdMs: number,
  ): Promise<void> {
    await mkdir(dir, { recursive: true });
    const name = `${order}_${createdMs}${FILE_SUFFIX}`;
    await writeFile(join(dir, name), serializeEnvelope(envelope));
    await prune();
  }

  return {
    push: (envelope) =>
      serial(async () => {
        lastOrder = Math.max(now(), lastOrder + 1);
        await write(envelope, lastOrder, now());
      }),
    unshift: (envelope) =>
      serial(async () => {
        const [first] = await readEntries();
        const order = Math.max((first?.order ?? now()) - 1, 0);
        await write(envelope, order, lastShiftedCreatedMs ?? now());
      }),
    shift: () =>
      serial(async () => {
        const [first] = await prune();
        if (!first) return undefined;
        const data = await readFile(join(dir, first.name));
        await remove(first.name);
        lastShiftedCreatedMs = first.createdMs;
        return parseEnvelope(data);
      }),
    list: () =>
      serial(async () => {
        const queued: QueuedEnvelope[] = [];
        for (const entry of await prune()) {
          const data = await readFile(join(dir, entry.name));
          queued.push({
            id: entry.name,
            createdMs: entry.createdMs,
            envelope: parseEnvelope(data),
          });
        }
        return queued;
      }),
    clear: () =>
      serial(async () => {
        await rm(dir, { recursive: true, force: true });
      }),
  };
}
