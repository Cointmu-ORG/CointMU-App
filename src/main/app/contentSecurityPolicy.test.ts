import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./contentSecurityPolicy";

const directive = (policy: string, name: string): string =>
  policy.split("; ").find((d) => d.startsWith(name + " ")) ?? "";

describe("buildContentSecurityPolicy", () => {
  it("is strict when packaged: no eval, no inline or remote script, no remote images", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(directive(policy, "script-src")).toBe("script-src 'self'");
    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob:");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("localhost");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'none'");
  });

  it("adds the Vite HMR allowances only in dev", () => {
    const policy = buildContentSecurityPolicy(false);

    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "connect-src")).toContain("ws://localhost:*");
    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob:");
  });
});
