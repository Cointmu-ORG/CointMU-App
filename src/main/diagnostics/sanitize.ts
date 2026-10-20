import { LangEn } from "ethers/wordlists";
import { redactEthersErrorDetails } from "./ethersErrorDetails";

const BIP39_WORD_COUNT = 2048;
/** Fewer than a 12-word phrase, so a phrase split by typos is still caught. */
const MIN_MNEMONIC_WORDS = 8;
const MAX_MNEMONIC_TYPOS = 2;

export const REDACTED = {
  MNEMONIC: "[REDACTED:mnemonic]",
  SECRET_HEX: "[REDACTED:hex]",
  ADDRESS: "[REDACTED:address]",
  IP: "[REDACTED:ip]",
  USER: "<user>",
} as const;

const wordlist = LangEn.wordlist();
const BIP39_WORDS: ReadonlySet<string> = new Set(
  Array.from({ length: BIP39_WORD_COUNT }, (_, i) => wordlist.getWord(i)),
);

/** A word not preceded by a backslash, so the `n` of an escaped `\n` never starts one. */
const WORD_PATTERN = /(?<!\\)[a-z]+/gi;
/** What may sit between two mnemonic words: whitespace, quotes, commas, brackets, JSON escapes. */
const MNEMONIC_GAP_PATTERN = /^(?:[\s,;|"'`[\]]|\\[nrt"'\\])+$/;
/** 64+ hex chars: private keys, hashes, signed transactions, enode ids. */
const LONG_HEX_PATTERN = /(?<![0-9a-f])(?:0x)?[0-9a-f]{64,}(?![0-9a-f])/gi;
const ADDRESS_PATTERN = /(?<![0-9a-f])(?:0x)?[0-9a-f]{40}(?![0-9a-f])/gi;
const IPV4_PATTERN =
  /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g;
/** Full 8-group IPv6, or any form compressed with `::`. */
const IPV6_PATTERN =
  /(?<![\w:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{0,4}::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?)(?![\w:])/gi;
/** `/home/<user>`, `/Users/<user>`, `C:\Users\<user>`, also with JSON-escaped `\\`. */
const HOME_PATH_PATTERN = /((?:^|[\\/])(?:home|Users)[\\/]+)[^\\/\s"'`:]+/gi;
const MIN_LITERAL_LENGTH = 3;

interface MnemonicRun {
  readonly start: number;
  /** Start of a misspelled word right before the first BIP39 word, if any. */
  readonly leadStart: number | null;
  end: number;
  words: number;
  typos: number;
}

interface WordToken {
  readonly start: number;
  readonly end: number;
  readonly isBip39: boolean;
}

function isMnemonicGap(text: string, from: number, to: number): boolean {
  return MNEMONIC_GAP_PATTERN.test(text.slice(from, to));
}

function startRun(
  text: string,
  word: WordToken,
  previous: WordToken | null,
): MnemonicRun {
  const hasLead =
    previous !== null &&
    !previous.isBip39 &&
    isMnemonicGap(text, previous.end, word.start);
  return {
    start: word.start,
    leadStart: hasLead ? previous.start : null,
    end: word.end,
    words: 1,
    typos: 0,
  };
}

/**
 * Finds runs that look like a recovery phrase: at least 8 BIP39 words joined by
 * mnemonic separators (spaces, newlines, commas, quotes, a JSON array), with up
 * to 2 other words (typos) inside or right before them, so a mistyped phrase is
 * still caught whole.
 * @param text - Input text.
 * @returns [start, end) offsets of each run.
 */
function findMnemonicSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let run: MnemonicRun | null = null;
  let previous: WordToken | null = null;
  const closeRun = (): void => {
    if (run && run.words >= MIN_MNEMONIC_WORDS) {
      const start =
        run.leadStart !== null && run.typos < MAX_MNEMONIC_TYPOS
          ? run.leadStart
          : run.start;
      spans.push([start, run.end]);
    }
    run = null;
  };
  for (const token of text.matchAll(WORD_PATTERN)) {
    const current: WordToken = {
      start: token.index,
      end: token.index + token[0].length,
      isBip39: BIP39_WORDS.has(token[0].toLowerCase()),
    };
    if (run && !isMnemonicGap(text, run.end, current.start)) closeRun();
    if (run && !current.isBip39 && run.typos === MAX_MNEMONIC_TYPOS) {
      closeRun();
    } else if (run) {
      run.end = current.end;
      if (current.isBip39) run.words += 1;
      else run.typos += 1;
    } else if (current.isBip39) {
      run = startRun(text, current, previous);
    }
    previous = current;
  }
  closeRun();
  return spans;
}

function redactMnemonics(text: string): string {
  return findMnemonicSpans(text)
    .reverse()
    .reduce(
      (acc, [start, end]) =>
        acc.slice(0, start) + REDACTED.MNEMONIC + acc.slice(end),
      text,
    );
}

/**
 * Rewrites the user name out of home-directory paths on Linux, macOS and Windows.
 * @param path - A path or text containing paths.
 * @returns The input with every home directory owner replaced by `<user>`.
 */
export function normalizePath(path: string): string {
  return path.replace(HOME_PATH_PATTERN, `$1${REDACTED.USER}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes secrets and identifying data from free text before it is logged or
 * reported: argument values in ethers errors, mnemonics (typos tolerated),
 * private keys and other long hex, addresses, IPs, the user name in paths, and
 * any extra literal (e.g. the OS user or host name).
 * Passwords cannot be recognised and must never be passed in.
 * @param text - Input text.
 * @param literals - Extra exact strings to redact, case-insensitively.
 * @returns The sanitized text.
 */
export function sanitizeText(
  text: string,
  literals: readonly string[] = [],
): string {
  let result = redactMnemonics(redactEthersErrorDetails(text))
    .replace(LONG_HEX_PATTERN, REDACTED.SECRET_HEX)
    .replace(ADDRESS_PATTERN, REDACTED.ADDRESS)
    .replace(IPV4_PATTERN, REDACTED.IP)
    .replace(IPV6_PATTERN, REDACTED.IP);
  result = normalizePath(result);
  for (const literal of literals) {
    if (literal.length < MIN_LITERAL_LENGTH) continue;
    result = result.replace(
      new RegExp(escapeRegExp(literal), "gi"),
      REDACTED.USER,
    );
  }
  return result;
}
