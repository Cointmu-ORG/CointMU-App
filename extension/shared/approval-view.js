"use strict";

import { SigningKind } from "./signing-request.js";

/**
 * Builds what the approval popup shows for a queued request. Pure; the popup
 * only translates the keys and sets textContent.
 */

const WEI_PER_CMU = 10n ** 18n;
const CMU_DECIMALS = 18;
const NATIVE_SYMBOL = "CMU";
const EMPTY_DATA = "0x";
const HEX_PREFIX_LENGTH = 2;
const HEX_BYTE_LENGTH = 2;
const HEX_RADIX = 16;
const JSON_INDENT = 2;
const FIRST_PRINTABLE_CODE = 0x20;
const DELETE_CODE = 0x7f;
const ALLOWED_WHITESPACE = new Set(["\t", "\n", "\r"]);

/**
 * @param {string} text
 * @returns {boolean} True when the text has control characters other than
 * tab, newline and carriage return.
 */
function hasUnprintable(text) {
  return [...text].some((char) => {
    const code = char.codePointAt(0);
    const isControl = code < FIRST_PRINTABLE_CODE || code === DELETE_CODE;
    return isControl && !ALLOWED_WHITESPACE.has(char);
  });
}

const TitleKey = Object.freeze({
  CONNECT: "extension.approval.title.connect",
  [SigningKind.MESSAGE]: "extension.approval.title.message",
  [SigningKind.TYPED_DATA]: "extension.approval.title.typedData",
  [SigningKind.SEND_TRANSACTION]: "extension.approval.title.sendTransaction",
  [SigningKind.SIGN_TRANSACTION]: "extension.approval.title.signTransaction",
});

const LabelKey = Object.freeze({
  SITE: "extension.approval.label.site",
  ACCOUNT: "extension.approval.label.account",
  PERMISSION: "extension.approval.label.permission",
  MESSAGE: "extension.approval.label.message",
  NETWORK: "extension.approval.label.network",
  TYPE: "extension.approval.label.type",
  TO: "extension.approval.label.to",
  VALUE: "extension.approval.label.value",
  DATA: "extension.approval.label.data",
});

export const ValueKey = Object.freeze({
  ACCOUNTS: "extension.approval.value.accounts",
  CONTRACT_CREATION: "extension.approval.value.contractCreation",
});

export const WarningKey = Object.freeze({
  CONTRACT_DATA: "extension.approval.warning.contractData",
});

/**
 * @param {unknown} value - A wei amount as hex or decimal string, number or bigint.
 * @returns {string | null} The amount in whole CMU without trailing zeros, or
 * null when the value is malformed or negative.
 */
export function formatWeiAsCmu(value) {
  let wei;
  try {
    wei = value === undefined || value === null ? 0n : BigInt(value);
  } catch {
    return null;
  }
  if (wei < 0n) return null;
  const whole = wei / WEI_PER_CMU;
  const fraction = (wei % WEI_PER_CMU)
    .toString()
    .padStart(CMU_DECIMALS, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * @param {unknown} data - Transaction calldata.
 * @returns {boolean} True when the transaction carries calldata.
 */
export function hasContractData(data) {
  return (
    typeof data === "string" && data !== "" && data.toLowerCase() !== EMPTY_DATA
  );
}

/**
 * @param {{ message: string, isHex: boolean }} payload
 * @returns {string} The message as readable text when it is printable UTF-8,
 * otherwise the original hex.
 */
export function decodeMessage({ message, isHex }) {
  if (!isHex) return message;
  const hex = message.slice(HEX_PREFIX_LENGTH);
  const bytes = new Uint8Array(hex.length / HEX_BYTE_LENGTH);
  for (let i = 0; i < bytes.length; i++) {
    const start = i * HEX_BYTE_LENGTH;
    bytes[i] = parseInt(hex.slice(start, start + HEX_BYTE_LENGTH), HEX_RADIX);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return hasUnprintable(text) ? message : text;
  } catch {
    return message;
  }
}

const row = (labelKey, value, isData = false) => ({ labelKey, value, isData });

function transactionRows(payload) {
  const value = formatWeiAsCmu(payload.value);
  const rows = [
    payload.to
      ? row(LabelKey.TO, payload.to)
      : { labelKey: LabelKey.TO, valueKey: ValueKey.CONTRACT_CREATION },
    row(
      LabelKey.VALUE,
      value === null ? String(payload.value) : `${value} ${NATIVE_SYMBOL}`,
    ),
  ];
  if (hasContractData(payload.data)) {
    rows.push(row(LabelKey.DATA, payload.data, true));
  }
  return rows;
}

function signingRows(request) {
  const { kind, payload } = request;
  if (kind === SigningKind.MESSAGE) {
    return [row(LabelKey.MESSAGE, decodeMessage(payload), true)];
  }
  if (kind === SigningKind.TYPED_DATA) {
    return [
      row(LabelKey.NETWORK, String(payload.domain.chainId)),
      row(LabelKey.TYPE, payload.primaryType),
      row(
        LabelKey.MESSAGE,
        JSON.stringify(payload.message, null, JSON_INDENT),
        true,
      ),
    ];
  }
  return transactionRows(payload);
}

function isContractInteraction(request) {
  const isTransaction =
    request.kind === SigningKind.SEND_TRANSACTION ||
    request.kind === SigningKind.SIGN_TRANSACTION;
  return (
    isTransaction &&
    (hasContractData(request.payload.data) || !request.payload.to)
  );
}

/**
 * @param {{ origin: string, request: { kind: string, address: string, payload: object } | null }} entry
 * A queued approval; `request` is null for a connection request.
 * @returns {{ titleKey: string, rows: Array<{ labelKey: string, value?: string, valueKey?: string, isData?: boolean }>, warningKey: string | null }}
 */
export function buildApprovalView({ origin, request }) {
  const site = row(LabelKey.SITE, origin);
  if (request === null) {
    return {
      titleKey: TitleKey.CONNECT,
      rows: [
        site,
        { labelKey: LabelKey.PERMISSION, valueKey: ValueKey.ACCOUNTS },
      ],
      warningKey: null,
    };
  }
  return {
    titleKey: TitleKey[request.kind],
    rows: [
      site,
      row(LabelKey.ACCOUNT, request.address),
      ...signingRows(request),
    ],
    warningKey: isContractInteraction(request)
      ? WarningKey.CONTRACT_DATA
      : null,
  };
}
