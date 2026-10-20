import { describe, expect, it } from "vitest";
import { REDACTED, normalizePath, sanitizeText } from "./sanitize";

// Throwaway phrases generated for this test; they never held funds.
const MNEMONIC_12 =
  "render heart slice exact brief patient woman shoulder endorse space approve victory";
const MNEMONIC_24 =
  "pelican cheap degree bright dawn useless hedgehog ice lounge friend danger turtle mean dentist often spider radio rocket acoustic equip stay misery load awkward";
const WORDS_12 = MNEMONIC_12.split(" ");
const PRIVATE_KEY =
  "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const ADDRESS = "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23";
const SIGNED_TX = `0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a0${"28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276"}a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83`;

describe("sanitizeText mnemonics", () => {
  it.each([
    ["single spaces (12 words)", MNEMONIC_12],
    ["single spaces (24 words)", MNEMONIC_24],
    ["double spaces", WORDS_12.join("  ")],
    ["newlines", WORDS_12.join("\n")],
    ["CRLF and tabs", WORDS_12.join("\r\n\t")],
    ["commas", WORDS_12.join(",")],
    ["comma and space", WORDS_12.join(", ")],
    ["quoted words", WORDS_12.map((w) => `"${w}"`).join(" ")],
    ["JSON array", JSON.stringify(WORDS_12)],
    ["JSON string with escaped newlines", JSON.stringify(WORDS_12.join("\n"))],
    ["upper case", MNEMONIC_12.toUpperCase()],
  ])("redacts a phrase separated by %s", (_, phrase) => {
    const result = sanitizeText(`wallet import failed: ${phrase} (end)`);

    expect(result).toContain(REDACTED.MNEMONIC);
    for (const word of WORDS_12.slice(1, -1)) {
      expect(result.toLowerCase()).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
    expect(result).toContain("wallet import failed:");
    expect(result).toContain("(end)");
  });

  it("redacts a 24-word phrase entirely", () => {
    const result = sanitizeText(MNEMONIC_24);

    expect(result).toBe(REDACTED.MNEMONIC);
  });

  it("keeps ordinary prose that happens to use a few BIP39 words", () => {
    const line =
      "INFO [10-20|12:34:56.789] Imported new chain segment number=1024 hash=abc age=1s";

    expect(sanitizeText(line)).toBe(line);
  });

  it("keeps runs shorter than 12 words", () => {
    const eleven = WORDS_12.slice(0, 11).join(" ");

    expect(sanitizeText(eleven)).toBe(eleven);
  });
});

describe("sanitizeText hex and addresses", () => {
  it("redacts a 64-char private key with and without 0x", () => {
    expect(sanitizeText(`key=${PRIVATE_KEY}`)).toBe(
      `key=${REDACTED.SECRET_HEX}`,
    );
    expect(sanitizeText(`key=0x${PRIVATE_KEY}`)).toBe(
      `key=${REDACTED.SECRET_HEX}`,
    );
  });

  it("redacts a key glued to an identifier", () => {
    expect(sanitizeText(`pk_${PRIVATE_KEY}`)).toBe(`pk_${REDACTED.SECRET_HEX}`);
  });

  it("redacts a signed transaction as one block", () => {
    expect(sanitizeText(`raw=${SIGNED_TX} sent`)).toBe(
      `raw=${REDACTED.SECRET_HEX} sent`,
    );
  });

  it("redacts checksummed and bare addresses", () => {
    expect(sanitizeText(`to ${ADDRESS}`)).toBe(`to ${REDACTED.ADDRESS}`);
    expect(sanitizeText(`to ${ADDRESS.slice(2).toLowerCase()}`)).toBe(
      `to ${REDACTED.ADDRESS}`,
    );
  });

  it("keeps short hex values", () => {
    expect(sanitizeText("want=0x9b1e2c4d got=0x00000000")).toBe(
      "want=0x9b1e2c4d got=0x00000000",
    );
  });
});

describe("sanitizeText network and identity", () => {
  it("redacts IPv4 addresses in enode URLs", () => {
    expect(sanitizeText("dial 10.64.24.248:30303 failed")).toBe(
      `dial ${REDACTED.IP}:30303 failed`,
    );
  });

  it("keeps version strings that are not IPs", () => {
    expect(sanitizeText("Chrome/140.0.7339.80 Electron/44.8.0")).toBe(
      "Chrome/140.0.7339.80 Electron/44.8.0",
    );
  });

  it("redacts IPv6 addresses but not log timestamps", () => {
    expect(sanitizeText("peer fe80::1ff:fe23:4567:890a up")).toBe(
      `peer ${REDACTED.IP} up`,
    );
    expect(sanitizeText("[10-20|12:34:56.789]")).toBe("[10-20|12:34:56.789]");
  });

  it("redacts extra literals such as the OS user and host name", () => {
    expect(
      sanitizeText("host DESKTOP-NAOMI user naomi", ["DESKTOP-NAOMI", "naomi"]),
    ).toBe("host <user> user <user>");
  });
});

describe("normalizePath", () => {
  it.each([
    ["/home/naomi/.config/CointMU/logs", "/home/<user>/.config/CointMU/logs"],
    ["/Users/naomi/Library/Logs/CointMU", "/Users/<user>/Library/Logs/CointMU"],
    [
      "C:\\Users\\Naomi\\AppData\\Roaming\\CointMU",
      "C:\\Users\\<user>\\AppData\\Roaming\\CointMU",
    ],
    ["C:\\\\Users\\\\Naomi\\\\AppData", "C:\\\\Users\\\\<user>\\\\AppData"],
    ["C:/Users/Naomi/AppData", "C:/Users/<user>/AppData"],
    [
      "at foo (file:///home/naomi/app/out/main/index.js:10:5)",
      "at foo (file:///home/<user>/app/out/main/index.js:10:5)",
    ],
  ])("rewrites %s", (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
    expect(sanitizeText(input)).toBe(expected);
  });
});
