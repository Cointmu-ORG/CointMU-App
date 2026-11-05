import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Modules such as geth/process/ports read process.env at load time, so .env
// (loaded by bootstrap) only reaches them if bootstrap evaluates first (#122).
describe("main entry import order", () => {
  it("imports bootstrap before any other module", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

    const firstImport = source.match(/^import\b[^;]*;/m)?.[0];

    expect(firstImport).toBe('import "./bootstrap";');
  });
});
