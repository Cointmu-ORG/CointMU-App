import { describe, expect, it } from "vitest";
import { REDACTED_ETHERS_DETAIL } from "./ethersErrorDetails";
import { sanitizeText } from "./sanitize";

// Messages exactly as ethers 6.17 builds them (captured with makeError output).
// The key below is a throwaway with its last hex digit mistyped as "z".
const TYPOED_KEY =
  "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f36231z";
const PHRASE =
  "render heart slice exact brief patient woman shoulder endorse space approve victoyr";

const R = REDACTED_ETHERS_DETAIL;

describe("sanitizeText ethers error details", () => {
  it.each([
    [
      "mistyped private key (not caught by the hex rule)",
      `invalid BytesLike value (argument="value", value="${TYPOED_KEY}", code=INVALID_ARGUMENT, version=6.17.0)`,
      `invalid BytesLike value (argument="value", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
    ],
    [
      "mnemonic value from another code path",
      `invalid mnemonic word at index 11 (argument="mnemonic", value="${PHRASE}", code=INVALID_ARGUMENT, version=6.17.0)`,
      `invalid mnemonic word at index 11 (argument="mnemonic", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
    ],
    [
      "private key already redacted by ethers",
      'invalid private key (argument="privateKey", value="[REDACTED]", code=INVALID_ARGUMENT, version=6.17.0)',
      `invalid private key (argument="privateKey", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
    ],
    [
      "object-valued info and transaction",
      'could not coalesce error (error={ "code": -32000 }, info={ "payload": { "params": [ "0xf86c" ] } }, transaction={ "data": "0xa9059cbb", "to": "0x1" }, code=UNKNOWN_ERROR, version=6.17.0)',
      `could not coalesce error (error={ "code": -32000 }, info=${R}, transaction=${R}, code=UNKNOWN_ERROR, version=6.17.0)`,
    ],
    [
      "serialized error JSON",
      `{"code":"INVALID_ARGUMENT","argument":"value","value":"${TYPOED_KEY}","shortMessage":"invalid BytesLike value"}`,
      `{"code":"INVALID_ARGUMENT","argument":"value","value":${R},"shortMessage":"invalid BytesLike value"}`,
    ],
    [
      "JSON-escaped message inside a JSON string",
      JSON.stringify({
        message: `invalid BytesLike value (argument="value", value="${TYPOED_KEY}", code=INVALID_ARGUMENT, version=6.17.0)`,
      }),
      JSON.stringify({
        message: `invalid BytesLike value (argument="value", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
      }),
    ],
    [
      "bare numeric value",
      'invalid value for Contract target (argument="target", value=12345, code=INVALID_ARGUMENT, version=6.17.0)',
      `invalid value for Contract target (argument="target", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
    ],
  ])("redacts %s", (_, input, expected) => {
    expect(sanitizeText(input)).toBe(expected);
  });

  it("leaves value= alone on lines that are not ethers errors", () => {
    const geth =
      "INFO [10-20|12:40:01.002] Submitted transaction hash=abc value=1,000,000";

    expect(sanitizeText(geth)).toBe(geth);
  });

  it("only redacts the ethers line in a multi-line text", () => {
    const text = [
      "INFO Submitted transaction value=5",
      'invalid address (argument="address", value="0x123", code=INVALID_ARGUMENT, version=6.17.0)',
    ].join("\n");

    expect(sanitizeText(text)).toBe(
      [
        "INFO Submitted transaction value=5",
        `invalid address (argument="address", value=${R}, code=INVALID_ARGUMENT, version=6.17.0)`,
      ].join("\n"),
    );
  });
});
