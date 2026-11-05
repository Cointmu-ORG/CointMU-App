import { crc32, deflateRawSync } from "node:zlib";

/** One file in the archive. */
export interface ZipEntry {
  /** Path inside the archive, "/"-separated. */
  readonly name: string;
  readonly data: Buffer;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_OF_CENTRAL_DIR_BYTES = 22;
const VERSION_NEEDED = 20;
const UTF8_NAMES_FLAG = 0x0800;
const METHOD_DEFLATE = 8;
const DOS_EPOCH_YEAR = 1980;

/**
 * @param date - A local time.
 * @returns MS-DOS time and date words.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((date.getFullYear() - DOS_EPOCH_YEAR) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

/**
 * The fields shared by a file's local header and its central directory entry,
 * from "version needed" through "extra field length".
 */
function commonFields(
  entry: ZipEntry,
  compressed: Buffer,
  stamp: { time: number; date: number },
): Buffer {
  const fields = Buffer.alloc(26);
  fields.writeUInt16LE(VERSION_NEEDED, 0);
  fields.writeUInt16LE(UTF8_NAMES_FLAG, 2);
  fields.writeUInt16LE(METHOD_DEFLATE, 4);
  fields.writeUInt16LE(stamp.time, 6);
  fields.writeUInt16LE(stamp.date, 8);
  fields.writeUInt32LE(crc32(entry.data), 10);
  fields.writeUInt32LE(compressed.length, 14);
  fields.writeUInt32LE(entry.data.length, 18);
  fields.writeUInt16LE(Buffer.byteLength(entry.name), 22);
  fields.writeUInt16LE(0, 24);
  return fields;
}

/**
 * Builds a deflate-compressed ZIP archive in memory. Small archives only:
 * no ZIP64, so every file and the whole archive must stay under 4 GiB.
 * @param entries - The files.
 * @param now - Their modification time.
 * @returns The archive bytes.
 */
export function buildZip(
  entries: readonly ZipEntry[],
  now: Date = new Date(),
): Buffer {
  const stamp = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const fields = commonFields(entry, compressed, stamp);

    const local = Buffer.alloc(LOCAL_HEADER_BYTES);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    fields.copy(local, 4);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(CENTRAL_HEADER_BYTES);
    central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4);
    fields.copy(central, 6);
    // Comment length, disk number, internal and external attributes: 0.
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(END_OF_CENTRAL_DIR_BYTES);
  end.writeUInt32LE(END_OF_CENTRAL_DIR_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}
