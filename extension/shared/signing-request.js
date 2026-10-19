"use strict";

import "./protocol.js";

/**
 * Validates and normalizes dApp signing requests before they reach the
 * approval popup. Pure: no chrome or ethers access, so it is unit-tested.
 */

const { ErrorCode, SIGNING_METHODS } = globalThis.CointMUProtocol;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const DECIMAL_PATTERN = /^\d+$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const TYPED_DATA_DOMAIN_TYPE = "EIP712Domain";

export const SigningKind = Object.freeze({
  MESSAGE: "message",
  TYPED_DATA: "typedData",
  SEND_TRANSACTION: "sendTransaction",
  SIGN_TRANSACTION: "signTransaction",
});

/** Transaction fields passed on to ethers; anything else is dropped. */
const TRANSACTION_FIELDS = [
  "to",
  "value",
  "data",
  "nonce",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
];

const fail = (code, message) => ({ ok: false, error: { code, message } });
const succeed = (request) => ({ ok: true, request });

/**
 * @param {string} method - A JSON-RPC method.
 * @returns {boolean} True when the method signs on behalf of the user.
 */
export function isSigningMethod(method) {
  return SIGNING_METHODS.includes(method);
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} True for two equal addresses, ignoring checksum case.
 */
export function isSameAddress(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    ADDRESS_PATTERN.test(a) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

/**
 * @param {unknown} value - A chain id as number, decimal string or hex string.
 * @returns {bigint | null} The chain id, or null when missing or malformed.
 */
export function parseChainId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return BigInt(value);
  }
  if (typeof value === "bigint" && value > 0n) return value;
  if (typeof value !== "string") return null;
  if (DECIMAL_PATTERN.test(value) || HEX_QUANTITY_PATTERN.test(value)) {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : null;
  }
  return null;
}

function checkSigner(address, activeAddress) {
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) {
    return fail(ErrorCode.INVALID_PARAMS, "Invalid signer address.");
  }
  if (!isSameAddress(address, activeAddress)) {
    return fail(
      ErrorCode.UNAUTHORIZED,
      "The requested address is not the active CointMU account.",
    );
  }
  return null;
}

function checkChain(requested, activeChainId, subject) {
  if (activeChainId === null) {
    return fail(ErrorCode.UNAUTHORIZED, "No active network is selected.");
  }
  if (requested !== activeChainId) {
    return fail(
      ErrorCode.INVALID_PARAMS,
      `${subject} chainId does not match the active network (${activeChainId}).`,
    );
  }
  return null;
}

function parsePersonalSign(params, context) {
  const [message, address] = params;
  const signerError = checkSigner(address, context.activeAddress);
  if (signerError) return signerError;
  if (typeof message !== "string") {
    return fail(ErrorCode.INVALID_PARAMS, "Message must be a string.");
  }
  return succeed({
    kind: SigningKind.MESSAGE,
    address,
    payload: { message, isHex: HEX_DATA_PATTERN.test(message) },
  });
}

function readTypedData(raw) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTypedData(params, context) {
  const [address, raw] = params;
  const signerError = checkSigner(address, context.activeAddress);
  if (signerError) return signerError;

  const typedData = readTypedData(raw);
  const { domain, types, primaryType, message } = typedData ?? {};
  if (
    !isPlainObject(domain) ||
    !isPlainObject(types) ||
    typeof primaryType !== "string" ||
    !Array.isArray(types[primaryType]) ||
    !isPlainObject(message)
  ) {
    return fail(ErrorCode.INVALID_PARAMS, "Malformed typed data.");
  }

  const chainId = parseChainId(domain.chainId);
  if (chainId === null) {
    return fail(
      ErrorCode.INVALID_PARAMS,
      "Typed data must set domain.chainId.",
    );
  }
  const chainError = checkChain(chainId, context.chainId, "Typed data");
  if (chainError) return chainError;

  // ethers derives the domain type itself and rejects it in `types`.
  const messageTypes = { ...types };
  delete messageTypes[TYPED_DATA_DOMAIN_TYPE];
  return succeed({
    kind: SigningKind.TYPED_DATA,
    address,
    payload: { domain, types: messageTypes, primaryType, message },
  });
}

function pickTransactionFields(tx) {
  const picked = {};
  for (const field of TRANSACTION_FIELDS) {
    if (tx[field] !== undefined && tx[field] !== null)
      picked[field] = tx[field];
  }
  if (picked.data === undefined && typeof tx.input === "string") {
    picked.data = tx.input;
  }
  const gasLimit = tx.gas ?? tx.gasLimit;
  if (gasLimit !== undefined && gasLimit !== null) picked.gasLimit = gasLimit;
  return picked;
}

function parseTransaction(params, context, kind) {
  const [tx] = params;
  if (!isPlainObject(tx)) {
    return fail(ErrorCode.INVALID_PARAMS, "Missing transaction object.");
  }
  const signerError = checkSigner(tx.from, context.activeAddress);
  if (signerError) return signerError;
  if (tx.to !== undefined && tx.to !== null && !ADDRESS_PATTERN.test(tx.to)) {
    return fail(ErrorCode.INVALID_PARAMS, "Invalid recipient address.");
  }

  const requestedChain =
    tx.chainId === undefined || tx.chainId === null
      ? context.chainId
      : parseChainId(tx.chainId);
  if (requestedChain === null && tx.chainId !== undefined) {
    return fail(ErrorCode.INVALID_PARAMS, "Invalid transaction chainId.");
  }
  const chainError = checkChain(requestedChain, context.chainId, "Transaction");
  if (chainError) return chainError;

  return succeed({
    kind,
    address: tx.from,
    payload: { ...pickTransactionFields(tx), chainId: context.chainId },
  });
}

/**
 * Validates a signing request against the active account and network.
 * eth_sign (raw hash signing) and legacy eth_signTypedData are refused.
 * @param {string} method - The JSON-RPC method.
 * @param {unknown} params - The JSON-RPC params.
 * @param {{ activeAddress: string | null, chainId: bigint | null }} context
 * @returns {{ ok: true, request: { kind: string, address: string, payload: object } }
 *   | { ok: false, error: { code: number, message: string } }}
 */
export function parseSigningRequest(method, params, context) {
  if (!Array.isArray(params)) {
    return fail(ErrorCode.INVALID_PARAMS, "Params must be an array.");
  }
  switch (method) {
    case "personal_sign":
      return parsePersonalSign(params, context);
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return parseTypedData(params, context);
    case "eth_sendTransaction":
      return parseTransaction(params, context, SigningKind.SEND_TRANSACTION);
    case "eth_signTransaction":
      return parseTransaction(params, context, SigningKind.SIGN_TRANSACTION);
    case "eth_sign":
      return fail(
        ErrorCode.UNSUPPORTED_METHOD,
        "eth_sign is not supported because it signs raw hashes. Use personal_sign or eth_signTypedData_v4.",
      );
    default:
      return fail(
        ErrorCode.UNSUPPORTED_METHOD,
        `${method} is not supported. Use eth_signTypedData_v4.`,
      );
  }
}
