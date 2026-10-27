import { describe, expect, it } from "vitest";
import { resolveDialogText } from "./dialogText";

const FALLBACK = { title: "Export Keystore", filterName: "JSON" };

describe("resolveDialogText", () => {
  it("keeps valid renderer text, trimmed", () => {
    expect(
      resolveDialogText(
        { title: " キーストアをエクスポート ", filterName: "JSON ファイル" },
        FALLBACK,
      ),
    ).toEqual({
      title: "キーストアをエクスポート",
      filterName: "JSON ファイル",
    });
  });

  it.each([undefined, null, "title", 42])("falls back for %s", (input) => {
    expect(resolveDialogText(input, FALLBACK)).toEqual(FALLBACK);
  });

  it("falls back per field for empty, non-string or oversized values", () => {
    expect(
      resolveDialogText({ title: "   ", filterName: 7 }, FALLBACK),
    ).toEqual(FALLBACK);
    expect(
      resolveDialogText(
        { title: "x".repeat(201), filterName: "Zip" },
        FALLBACK,
      ),
    ).toEqual({ title: FALLBACK.title, filterName: "Zip" });
  });
});
