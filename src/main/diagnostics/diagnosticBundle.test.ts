import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { Wallet } from "ethers";
import { collectDiagnosticBundle } from "./diagnosticBundle";
import { buildZip, type ZipEntry } from "./zipWriter";

const MNEMONIC = "test test test test test test test test test test test junk";
const PRIVATE_KEY = Wallet.fromPhrase(MNEMONIC).privateKey;
const KEYSTORE_CIPHERTEXT =
  "5318b4d5bcd28de64ee5559e671353e16f075ecae9f99c7a79a38af5f869aa46";
const ADDRESS = "0x2BC096C7573c73f896DFb3fbb3b9BEa1C8FCE797";

/** A store like a real one, with every kind of secret the app keeps. */
const STORE = {
  mnemonic: MNEMONIC,
  encryptedPayload: JSON.stringify({ ciphertext: KEYSTORE_CIPHERTEXT }),
  accounts: [{ address: ADDRESS, encryptedKey: KEYSTORE_CIPHERTEXT }],
  activeWalletAddress: ADDRESS,
  notificationHistory: [{ title: "Sent 5 CMU" }],
  connectedSites: ["https://dapp.example"],
  general: { closeAction: "tray", currency: "usd" },
  mining: { poolAddress: ADDRESS, cpuThreads: 4 },
  network: { maxPeers: 14 },
};

let logsDir: string;

beforeEach(async () => {
  logsDir = await mkdtemp(join(tmpdir(), "diag-logs-"));
  await writeFile(
    join(logsDir, "main.log"),
    `[info] imported ${PRIVATE_KEY}\n[info] phrase: ${MNEMONIC}\n[info] userData /home/rizki/.config/CointMU\n`,
  );
  await writeFile(
    join(logsDir, "geth.old.log"),
    "INFO Imported new chain segment\n",
  );
  await writeFile(join(logsDir, "notes.txt"), "not a log");
  await mkdir(join(logsDir, "sub"));
});

afterEach(async () => {
  await rm(logsDir, { recursive: true, force: true });
});

async function bundleText(): Promise<{ entries: ZipEntry[]; text: string }> {
  const entries = await collectDiagnosticBundle({
    logsDir,
    settings: STORE,
    versions: async () => ({ app: "1.7.4", geth: "1.12.20" }),
  });
  return {
    entries,
    text: entries.map((entry) => entry.data.toString("utf8")).join("\n"),
  };
}

describe("collectDiagnosticBundle", () => {
  it("holds the logs, versions and non-secret settings", async () => {
    const { entries, text } = await bundleText();

    expect(entries.map((entry) => entry.name)).toEqual([
      "versions.json",
      "settings.json",
      "logs/geth.old.log",
      "logs/main.log",
    ]);
    expect(text).toContain('"closeAction": "tray"');
    expect(text).toContain("Imported new chain segment");
  });

  it("contains no key, keystore, mnemonic, address or user name", async () => {
    const { text } = await bundleText();

    expect(text).not.toContain(PRIVATE_KEY.slice(2));
    expect(text).not.toContain(KEYSTORE_CIPHERTEXT);
    expect(text).not.toMatch(/test test test/);
    expect(text.toLowerCase()).not.toContain(ADDRESS.slice(2).toLowerCase());
    expect(text).not.toContain("rizki");
    expect(text).not.toMatch(
      /"(mnemonic|encryptedPayload|encryptedKey|accounts|activeWalletAddress)"/,
    );
    expect(text).toContain("[REDACTED:mnemonic]");
    expect(text).not.toContain("Sent 5 CMU");
    expect(text).not.toContain("dapp.example");
  });
});

/** Reads back every entry of an archive through its central directory. */
function readZip(zip: Buffer): Record<string, string> {
  const end = zip.length - 22;
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let i = 0; i < count; i += 1) {
    const nameLength = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const local = zip.readUInt32LE(at + 42);
    const size = zip.readUInt32LE(at + 20);
    const crc = zip.readUInt32LE(at + 16);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26);
    const data = inflateRawSync(zip.subarray(dataStart, dataStart + size));
    expect(crc32(data)).toBe(crc);
    files[name] = data.toString("utf8");
    at += 46 + nameLength;
  }
  return files;
}

describe("buildZip", () => {
  it("round-trips names (UTF-8 too) and contents", () => {
    const zip = buildZip([
      { name: "a.txt", data: Buffer.from("hello") },
      { name: "logs/ログ.log", data: Buffer.from("x".repeat(10_000)) },
    ]);

    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(readZip(zip)).toEqual({
      "a.txt": "hello",
      "logs/ログ.log": "x".repeat(10_000),
    });
  });
});
