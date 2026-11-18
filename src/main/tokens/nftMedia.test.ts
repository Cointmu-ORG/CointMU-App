import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IPFS_GATEWAY,
  MAX_IMAGE_BYTES,
  loadNftImage,
  loadNftMedia,
  toHttpsUrl,
} from "./nftMedia";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

function respond(
  body: BodyInit,
  headers: Record<string, string>,
  status = 200,
) {
  return new Response(body, { status, headers });
}

afterEach(() => vi.unstubAllGlobals());

describe("toHttpsUrl", () => {
  it("maps ipfs:// to the gateway and refuses other schemes", () => {
    expect(toHttpsUrl("ipfs://Qm1/a.json").href).toBe(
      IPFS_GATEWAY + "Qm1/a.json",
    );
    expect(toHttpsUrl("ipfs://ipfs/Qm1").href).toBe(IPFS_GATEWAY + "Qm1");
    expect(() => toHttpsUrl("http://example.com/a.png")).toThrow();
    expect(() => toHttpsUrl("file:///etc/passwd")).toThrow();
  });
});

describe("loadNftImage", () => {
  it("returns a checked https image as a data URL", async () => {
    vi.stubGlobal("fetch", async () =>
      respond(PNG_BYTES, { "content-type": "image/png" }),
    );

    expect(await loadNftImage("https://host/a.png")).toBe(
      `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`,
    );
  });

  it("refuses bytes that do not match the content type", async () => {
    vi.stubGlobal("fetch", async () =>
      respond("<html>", { "content-type": "image/png" }),
    );

    await expect(loadNftImage("https://host/a.png")).rejects.toThrow();
  });

  it("refuses non-image types and oversize bodies", async () => {
    vi.stubGlobal("fetch", async () =>
      respond("x", { "content-type": "text/html" }),
    );
    await expect(loadNftImage("https://host/a")).rejects.toThrow();

    vi.stubGlobal("fetch", async () =>
      respond(new Uint8Array(MAX_IMAGE_BYTES + 1), {
        "content-type": "image/png",
      }),
    );
    await expect(loadNftImage("https://host/big.png")).rejects.toThrow(
      "too large",
    );
  });

  it("refuses a redirect to plain http", async () => {
    vi.stubGlobal("fetch", async () =>
      respond("", { location: "http://host/a.png" }, 302),
    );

    await expect(loadNftImage("https://host/a.png")).rejects.toThrow(
      "unsupported scheme",
    );
  });
});

describe("loadNftMedia", () => {
  it("reads on-chain data: metadata with an SVG image without any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const image = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;
    const json = JSON.stringify({
      name: "Fixture #1‮",
      description: "d",
      image,
    });
    const uri = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;

    expect(await loadNftMedia(uri)).toEqual({
      name: "Fixture #1",
      description: "d",
      image,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps name and description when the image is refused", async () => {
    vi.stubGlobal("fetch", async (url: URL) =>
      String(url).endsWith(".json")
        ? respond(JSON.stringify({ name: "N", image: "https://host/x.png" }), {
            "content-type": "application/json",
          })
        : respond("not png", { "content-type": "image/png" }),
    );

    expect(await loadNftMedia("ipfs://Qm2/meta.json")).toEqual({
      name: "N",
      description: "",
      image: "",
    });
  });
});
