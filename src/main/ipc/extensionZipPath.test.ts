import { join } from "path";
import { describe, expect, it } from "vitest";
import { extensionZipPath } from "./extensionZipPath";

describe("extensionZipPath", () => {
  it("points a packaged build at the unpacked resources", () => {
    const appPath = join("/opt/CointMU/resources", "app.asar");

    expect(extensionZipPath(appPath)).toBe(
      join("/opt/CointMU/resources/app.asar.unpacked/resources/extension.zip"),
    );
  });

  it("reads the repository resources in development", () => {
    expect(extensionZipPath("/home/dev/CointMU-APP")).toBe(
      join("/home/dev/CointMU-APP/resources/extension.zip"),
    );
  });
});
