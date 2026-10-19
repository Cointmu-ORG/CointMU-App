import { describe, expect, it } from "vitest";
import {
  SigningKind,
  parseChainId,
  parseSigningRequest,
} from "./signing-request.js";

const ACTIVE = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x3333333333333333333333333333333333333333";
const CHAIN_ID = 1912n;
const OTHER_CHAIN_ID = 1n;
const CONTEXT = { activeAddress: ACTIVE, chainId: CHAIN_ID };

const ErrorCode = {
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  INVALID_PARAMS: -32602,
};

function typedData(chainId = Number(CHAIN_ID)) {
  return {
    domain: { name: "Permit", version: "1", chainId },
    types: {
      EIP712Domain: [{ name: "name", type: "string" }],
      Mail: [{ name: "contents", type: "string" }],
    },
    primaryType: "Mail",
    message: { contents: "hello" },
  };
}

describe("parseChainId", () => {
  it.each([
    [1912, 1912n],
    ["1912", 1912n],
    ["0x778", 1912n],
  ])("parses %j", (input, expected) => {
    expect(parseChainId(input)).toBe(expected);
  });

  it.each([undefined, null, "", "abc", 0, -1, 1.5, "0x"])(
    "rejects %j",
    (input) => {
      expect(parseChainId(input)).toBeNull();
    },
  );
});

describe("parseSigningRequest: personal_sign", () => {
  it("accepts [message, activeAddress] in any address case", () => {
    const result = parseSigningRequest(
      "personal_sign",
      ["0x68656c6c6f", ACTIVE.toUpperCase().replace("0X", "0x")],
      CONTEXT,
    );
    expect(result).toEqual({
      ok: true,
      request: {
        kind: SigningKind.MESSAGE,
        address: ACTIVE.toUpperCase().replace("0X", "0x"),
        payload: { message: "0x68656c6c6f", isHex: true },
      },
    });
  });

  it("marks a plain-text message as not hex", () => {
    const result = parseSigningRequest(
      "personal_sign",
      ["hello", ACTIVE],
      CONTEXT,
    );
    expect(result.request.payload.isHex).toBe(false);
  });

  it("refuses another account", () => {
    const result = parseSigningRequest(
      "personal_sign",
      ["0x00", OTHER],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("refuses swapped params", () => {
    const result = parseSigningRequest(
      "personal_sign",
      [ACTIVE, "0x00"],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });
});

describe("parseSigningRequest: typed data", () => {
  it.each(["eth_signTypedData_v3", "eth_signTypedData_v4"])(
    "accepts %s on the active chain and drops EIP712Domain",
    (method) => {
      const result = parseSigningRequest(
        method,
        [ACTIVE, JSON.stringify(typedData())],
        CONTEXT,
      );
      expect(result.ok).toBe(true);
      expect(result.request.kind).toBe(SigningKind.TYPED_DATA);
      expect(Object.keys(result.request.payload.types)).toEqual(["Mail"]);
    },
  );

  it("accepts an object instead of a JSON string", () => {
    const result = parseSigningRequest(
      "eth_signTypedData_v4",
      [ACTIVE, typedData()],
      CONTEXT,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a domain on another chain", () => {
    const result = parseSigningRequest(
      "eth_signTypedData_v4",
      [ACTIVE, typedData(Number(OTHER_CHAIN_ID))],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
    expect(result.error.message).toMatch(/chainId/);
  });

  it("refuses a domain without chainId", () => {
    const data = typedData();
    delete data.domain.chainId;
    const result = parseSigningRequest(
      "eth_signTypedData_v4",
      [ACTIVE, data],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });

  it.each([
    ["invalid JSON", "{oops"],
    ["a missing primary type", { ...typedData(), primaryType: "Nope" }],
    ["a missing message", { ...typedData(), message: undefined }],
  ])("refuses %s", (_label, raw) => {
    const result = parseSigningRequest(
      "eth_signTypedData_v4",
      [ACTIVE, raw],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });
});

describe("parseSigningRequest: transactions", () => {
  const tx = { from: ACTIVE, to: RECIPIENT, value: "0x1", gas: "0x5208" };

  it.each([
    ["eth_sendTransaction", SigningKind.SEND_TRANSACTION],
    ["eth_signTransaction", SigningKind.SIGN_TRANSACTION],
  ])("forces the active chainId for %s", (method, kind) => {
    const result = parseSigningRequest(method, [tx], CONTEXT);
    expect(result.request).toEqual({
      kind,
      address: ACTIVE,
      payload: {
        to: RECIPIENT,
        value: "0x1",
        gasLimit: "0x5208",
        chainId: CHAIN_ID,
      },
    });
  });

  it("accepts a matching explicit chainId", () => {
    const result = parseSigningRequest(
      "eth_sendTransaction",
      [{ ...tx, chainId: "0x778" }],
      CONTEXT,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses another chainId", () => {
    const result = parseSigningRequest(
      "eth_sendTransaction",
      [{ ...tx, chainId: "0x1" }],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });

  it("refuses a malformed chainId", () => {
    const result = parseSigningRequest(
      "eth_sendTransaction",
      [{ ...tx, chainId: "mainnet" }],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });

  it("refuses another sender", () => {
    const result = parseSigningRequest(
      "eth_sendTransaction",
      [{ ...tx, from: OTHER }],
      CONTEXT,
    );
    expect(result.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("refuses when no network is active", () => {
    const result = parseSigningRequest("eth_sendTransaction", [tx], {
      activeAddress: ACTIVE,
      chainId: null,
    });
    expect(result.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("drops unknown fields and maps input to data", () => {
    const result = parseSigningRequest(
      "eth_sendTransaction",
      [{ from: ACTIVE, input: "0xabcd", type: "0x2", accessList: [] }],
      CONTEXT,
    );
    expect(result.request.payload).toEqual({
      data: "0xabcd",
      chainId: CHAIN_ID,
    });
  });
});

describe("parseSigningRequest: refused methods", () => {
  it.each(["eth_sign", "eth_signTypedData"])(
    "refuses %s with 4200",
    (method) => {
      const result = parseSigningRequest(method, [ACTIVE, "0x00"], CONTEXT);
      expect(result.error.code).toBe(ErrorCode.UNSUPPORTED_METHOD);
    },
  );

  it("refuses non-array params", () => {
    const result = parseSigningRequest("personal_sign", "0x00", CONTEXT);
    expect(result.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });
});
