import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAddressName } from "../../bridge/address-names";
import { hasInvalidAccountLabel } from "./accountLabels";

const LOCALES_DIR = join(__dirname, "../../renderer/src/locales");
const DEFAULT_LABEL_KEYS = [
  "accountLabel",
  "mainAccountLabel",
  "importedAccount",
  "importedSeedAccount",
] as const;
// The highest account number a label is likely to show.
const LARGE_ACCOUNT_INDEX = "9999";

describe("default account labels", () => {
  it.each(readdirSync(LOCALES_DIR))(
    "pass the label check in %s, so a new account can be saved",
    (locale) => {
      const wallet = JSON.parse(
        readFileSync(join(LOCALES_DIR, locale, "wallet.json"), "utf8"),
      ) as { index: Record<string, string> };

      for (const key of DEFAULT_LABEL_KEYS) {
        const label = wallet.index[key].replace(
          "{{index}}",
          LARGE_ACCOUNT_INDEX,
        );
        expect(normalizeAddressName(label), `${locale} ${key}`).toBe(label);
      }
    },
  );
});

describe("hasInvalidAccountLabel", () => {
  it("refuses a value that is not a list of accounts", () => {
    expect(hasInvalidAccountLabel({ label: "Main" }, [])).toBe(true);
    expect(hasInvalidAccountLabel([{ label: "Main" }], [])).toBe(true);
  });

  it("matches a stored label by address in any letter case", () => {
    const stored = [{ address: "0xAbC", label: "‮old" }];

    expect(
      hasInvalidAccountLabel([{ address: "0xabc", label: "‮old" }], stored),
    ).toBe(false);
  });
});
