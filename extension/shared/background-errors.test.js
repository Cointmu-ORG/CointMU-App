import { describe, expect, it } from "vitest";
import {
  BackgroundErrorCode,
  backgroundError,
  describeBackgroundError,
} from "./background-errors.js";

const TRANSLATIONS = {
  "extension.errors.networkNotFound": "ネットワークが見つかりません。",
  "extension.wallet.unknownError": "不明なエラー",
};

describe("describeBackgroundError", () => {
  it("translates a code", () => {
    const response = backgroundError(BackgroundErrorCode.NETWORK_NOT_FOUND);

    expect(describeBackgroundError(response, TRANSLATIONS)).toBe(
      "ネットワークが見つかりません。",
    );
  });

  it("shows a technical detail as is", () => {
    const response = backgroundError(
      BackgroundErrorCode.TX_FAILED,
      "insufficient funds for intrinsic transaction cost",
    );

    expect(describeBackgroundError(response, TRANSLATIONS)).toBe(
      "insufficient funds for intrinsic transaction cost",
    );
  });

  it.each([undefined, {}, { errorCode: "NOPE" }, { errorCode: "toString" }])(
    "falls back to the unknown error text for %j",
    (response) => {
      expect(describeBackgroundError(response, TRANSLATIONS)).toBe(
        "不明なエラー",
      );
    },
  );

  it("falls back to English when the locale lacks the key", () => {
    expect(
      describeBackgroundError(
        backgroundError(BackgroundErrorCode.PROVIDER_FAILED),
        {},
      ),
    ).toBe("Unknown error");
  });

  it("covers every code with a key", () => {
    const keys = Object.values(BackgroundErrorCode).map((code) =>
      describeBackgroundError(
        backgroundError(code),
        new Proxy({}, { get: (_, key) => key }),
      ),
    );

    expect(keys).not.toContain("extension.wallet.unknownError");
  });
});
