import { describe, expect, it } from "vitest";
import type { Envelope, ErrorEvent } from "@sentry/core";
import {
  BreadcrumbCategory,
  filterEnvelopeItems,
  toAllowedBreadcrumb,
  toAllowedEvent,
} from "./eventAllowlist";
import { sanitizeText } from "./sanitize";

const ADDRESS = "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23";

function buildRichEvent(): ErrorEvent {
  return {
    type: undefined,
    event_id: "abc123",
    timestamp: 1_700_000_000,
    level: "error",
    platform: "node",
    release: "cointmu@1.6.17+6dc5db9b",
    environment: "production",
    server_name: "DESKTOP-NAOMI",
    user: { id: "u1", ip_address: "{{auto}}", username: "naomi" },
    request: { url: "http://127.0.0.1:8585", headers: { Cookie: "x" } },
    extra: { password: "hunter2" },
    modules: { ethers: "6.17.0" },
    message: `send to ${ADDRESS} failed`,
    tags: {
      "event.process": "browser",
      "geth.kind": "UNKNOWN_FATAL",
      "user.secret": "nope",
    },
    contexts: {
      os: { name: "Windows", version: "10.0.19045", kernel_version: "x" },
      app: { app_version: "1.6.17", app_name: "CointMU", app_memory: 1 },
      device: { hostname: "DESKTOP-NAOMI", memory_size: 1 },
      culture: { locale: "id-ID", timezone: "Asia/Jakarta" },
      electron: {
        "crashpad.process_type": "renderer",
        crashed_url: "file:///C:/Users/naomi/app/index.html",
        details: { type: "GPU", reason: "crashed", exitCode: 1, name: "x" },
      },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: `cannot read C:\\Users\\naomi\\AppData\\${ADDRESS}`,
          mechanism: { type: "onuncaughtexception", handled: false, data: {} },
          stacktrace: {
            frames: [
              {
                filename: "/home/naomi/app/out/main/index.js",
                function: "spawnGethProcess",
                lineno: 10,
                colno: 5,
                in_app: true,
                vars: { privateKey: "secret" },
                context_line: "const pk = '...'",
              },
            ],
          },
        },
      ],
    },
    breadcrumbs: [
      { category: "console", message: "password=hunter2" },
      { category: BreadcrumbCategory.GETH, message: "Fatal: dial 10.1.2.3" },
    ],
  };
}

describe("toAllowedEvent", () => {
  const sanitize = (text: string): string => sanitizeText(text, ["naomi"]);

  it("drops every field outside the allowlist", () => {
    const result = toAllowedEvent(buildRichEvent(), sanitize);

    expect(result).not.toHaveProperty("server_name");
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("request");
    expect(result).not.toHaveProperty("extra");
    expect(result).not.toHaveProperty("modules");
    expect(result.contexts).not.toHaveProperty("device");
    expect(result.contexts).not.toHaveProperty("culture");
    expect(result.tags).toEqual({
      "event.process": "browser",
      "geth.kind": "UNKNOWN_FATAL",
    });
  });

  it("keeps crash details but not the crashed URL", () => {
    const result = toAllowedEvent(buildRichEvent(), sanitize);

    expect(result.contexts?.electron).toEqual({
      "crashpad.process_type": "renderer",
      details: { type: "GPU", reason: "crashed", exitCode: 1 },
    });
  });

  it("drops frame locals and source lines and sanitizes paths", () => {
    const frame = toAllowedEvent(buildRichEvent(), sanitize).exception
      ?.values?.[0]?.stacktrace?.frames?.[0];

    expect(frame).toEqual({
      filename: "/home/<user>/app/out/main/index.js",
      function: "spawnGethProcess",
      lineno: 10,
      colno: 5,
      in_app: true,
    });
  });

  it("sanitizes the message and exception value", () => {
    const result = toAllowedEvent(buildRichEvent(), sanitize);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(ADDRESS);
    expect(serialized).not.toContain("naomi");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("10.1.2.3");
  });

  it("keeps only CointMU breadcrumbs", () => {
    const result = toAllowedEvent(buildRichEvent(), sanitize);

    expect(result.breadcrumbs).toEqual([
      {
        category: BreadcrumbCategory.GETH,
        message: "Fatal: dial [REDACTED:ip]",
        level: undefined,
        timestamp: undefined,
      },
    ]);
  });
});

describe("toAllowedBreadcrumb", () => {
  it.each(["console", "fetch", "http", "electron", undefined])(
    "drops category %s",
    (category) => {
      expect(toAllowedBreadcrumb({ category }, sanitizeText)).toBeNull();
    },
  );
});

describe("filterEnvelopeItems", () => {
  const headers = { event_id: "abc123" };

  it("removes minidump attachments and keeps the event", () => {
    const envelope = [
      headers,
      [
        [{ type: "event" }, { event_id: "abc123" }],
        [
          { type: "attachment", attachment_type: "event.minidump", length: 3 },
          new Uint8Array([1, 2, 3]),
        ],
      ],
    ] as unknown as Envelope;

    expect(filterEnvelopeItems(envelope)).toEqual([
      headers,
      [[{ type: "event" }, { event_id: "abc123" }]],
    ]);
  });

  it.each(["session", "log", "span", "feedback", "client_report"])(
    "drops an envelope holding only %s items",
    (type) => {
      const envelope = [headers, [[{ type }, {}]]] as unknown as Envelope;

      expect(filterEnvelopeItems(envelope)).toBeNull();
    },
  );
});
