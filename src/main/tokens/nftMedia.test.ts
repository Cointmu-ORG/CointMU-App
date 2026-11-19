import { describe, expect, it } from "vitest";
import {
  IPFS_GATEWAY,
  MAX_IMAGE_BYTES,
  loadNftImage,
  loadNftMedia,
  toHttpsUrl,
} from "./nftMedia";
import { fakeTransport } from "./publicHttps.fixtures";

const PUBLIC_IP = "93.184.216.34";
const DNS = { host: [PUBLIC_IP], "ipfs.io": [PUBLIC_IP] };
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

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
    const { transport } = fakeTransport(DNS, {
      "https://host/a.png": {
        headers: { "content-type": "image/png" },
        body: PNG_BYTES,
      },
    });

    expect(await loadNftImage("https://host/a.png", transport)).toBe(
      `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`,
    );
  });

  it("refuses bytes that do not match the content type", async () => {
    const { transport } = fakeTransport(DNS, {
      "https://host/a.png": {
        headers: { "content-type": "image/png" },
        body: "<html>",
      },
    });

    await expect(
      loadNftImage("https://host/a.png", transport),
    ).rejects.toThrow();
  });

  it("refuses non-image types and oversize bodies", async () => {
    const { transport } = fakeTransport(DNS, {
      "https://host/a": { headers: { "content-type": "text/html" }, body: "x" },
      "https://host/big.png": {
        headers: { "content-type": "image/png" },
        body: new Uint8Array(MAX_IMAGE_BYTES + 1),
      },
    });

    await expect(loadNftImage("https://host/a", transport)).rejects.toThrow();
    await expect(
      loadNftImage("https://host/big.png", transport),
    ).rejects.toThrow("too large");
  });

  it("refuses an image on a private address", async () => {
    const { transport } = fakeTransport({ "nas.local": ["192.168.1.2"] }, {});

    await expect(
      loadNftImage("https://nas.local/a.png", transport),
    ).rejects.toThrow("non-public address");
  });
});

describe("loadNftMedia", () => {
  it("reads on-chain data: metadata with an SVG image without any network call", async () => {
    const { transport, resolved } = fakeTransport({}, {});
    const image = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;
    const json = JSON.stringify({
      name: "Fixture #1‮",
      description: "d",
      image,
    });
    const uri = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;

    expect(await loadNftMedia(uri, transport)).toEqual({
      name: "Fixture #1",
      description: "d",
      image,
    });
    expect(resolved).toEqual([]);
  });

  it("keeps name and description when the image points at a private host", async () => {
    const { transport } = fakeTransport(
      { ...DNS, "metadata.internal": ["10.0.0.9"] },
      {
        "https://ipfs.io/ipfs/Qm2/meta.json": {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "N",
            image: "https://metadata.internal/x.png",
          }),
        },
      },
    );

    expect(await loadNftMedia("ipfs://Qm2/meta.json", transport)).toEqual({
      name: "N",
      description: "",
      image: "",
    });
  });
});
