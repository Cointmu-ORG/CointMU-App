export const REDACTED_ETHERS_DETAIL = "[REDACTED:ethers]";

/**
 * Marks an ethers error: `code=INVALID_ARGUMENT` / `argument="..."` in the
 * message, or `"code":"INVALID_ARGUMENT"` when the error was serialized to JSON
 * (also JSON-escaped). Without a marker the line is left alone, so geth's own
 * `value=` fields are kept.
 */
const ETHERS_ERROR_MARKER =
  /\bcode=[A-Z_]{3,}\b|\bargument=\\?"|\\?"code\\?"\s*:\s*\\?"[A-Z_]{3,}/;
/** ethers puts caller-supplied data in these detail fields. */
const DETAIL_KEY_PATTERN =
  /\b(?:value|info|transaction)=|\\?"(?:value|info|transaction)\\?"\s*:\s*/g;
const SCALAR_END_PATTERN = /[\s,)}\]]/;
const OPENING_BRACKETS = "{[";
const CLOSING_BRACKETS = "}]";
const ESCAPED_QUOTE = '\\"';

/**
 * Returns the end of the JSON-ish value starting at `start`: a quoted string
 * (plain or JSON-escaped), a bracketed object/array, or a bare scalar.
 */
function findValueEnd(text: string, start: number): number {
  if (text.startsWith(ESCAPED_QUOTE, start)) {
    const close = text.indexOf(ESCAPED_QUOTE, start + ESCAPED_QUOTE.length);
    return close === -1 ? text.length : close + ESCAPED_QUOTE.length;
  }
  const first = text[start];
  if (first === '"') return findStringEnd(text, start);
  if (first !== undefined && OPENING_BRACKETS.includes(first)) {
    return findBracketEnd(text, start);
  }
  let end = start;
  while (end < text.length && !SCALAR_END_PATTERN.test(text[end])) end += 1;
  return end;
}

function findStringEnd(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === '"') return i + 1;
  }
  return text.length;
}

function findBracketEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === '"') i = findStringEnd(text, i) - 1;
    else if (OPENING_BRACKETS.includes(char)) depth += 1;
    else if (CLOSING_BRACKETS.includes(char) && --depth === 0) return i + 1;
  }
  return text.length;
}

function redactLine(line: string): string {
  if (!ETHERS_ERROR_MARKER.test(line)) return line;
  let result = "";
  let cursor = 0;
  for (const key of line.matchAll(DETAIL_KEY_PATTERN)) {
    const valueStart = key.index + key[0].length;
    if (valueStart < cursor) continue;
    result += line.slice(cursor, valueStart) + REDACTED_ETHERS_DETAIL;
    cursor = findValueEnd(line, valueStart);
  }
  return result + line.slice(cursor);
}

/**
 * Redacts the `value`, `info` and `transaction` details of ethers errors,
 * whatever they hold. ethers v6 puts the offending argument there, which can
 * be a mistyped private key or phrase that no other rule would recognise.
 * Works per line, on the message form (`value="..."`) and on serialized JSON.
 * @param text - Input text.
 * @returns The text with those detail values replaced.
 */
export function redactEthersErrorDetails(text: string): string {
  return text.split("\n").map(redactLine).join("\n");
}
