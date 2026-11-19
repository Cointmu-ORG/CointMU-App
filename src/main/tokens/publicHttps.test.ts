import { describe, expect, it } from "vitest";
import { fakeTransport } from "./publicHttps.fixtures";
import { isBlockedAddress, nat64Ipv4 } from "./addressPolicy";
import { PublicFetchError, fetchPublicHttps } from "./publicHttps";

const PUBLIC_IP = "93.184.216.34";
const MAX = 1024;
const url = (href: string): URL => new URL(href);

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fd00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "64:ff9b::127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "64:ff9b::c0a8:101",
    "64:ff9b:1:7f00:0:100::",
    "64:ff9b:1:a00:0:500::",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700::1111",
    "64:ff9b::808:808",
    "64:ff9b::8.8.8.8",
    "64:ff9b:1:808:8:800::",
  ])("allows public %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("nat64Ipv4", () => {
  it("reads the IPv4 address embedded in both NAT64 prefixes", () => {
    expect(nat64Ipv4("64:ff9b::7f00:1")).toBe("127.0.0.1");
    expect(nat64Ipv4("64:ff9b::10.0.0.5")).toBe("10.0.0.5");
    expect(nat64Ipv4("64:ff9b:1:c0a8:1:200::")).toBe("192.168.1.2");
    expect(nat64Ipv4("2606:4700::1111")).toBeNull();
  });
});

describe("fetchPublicHttps", () => {
  it.each(["http://host/a", "ftp://host/a", "file:///etc/passwd"])(
    "refuses %s",
    async (href) => {
      const { transport, resolved } = fakeTransport({}, {});

      await expect(fetchPublicHttps(url(href), MAX, transport)).rejects.toThrow(
        "unsupported scheme",
      );
      expect(resolved).toEqual([]);
    },
  );

  it.each(["https://127.0.0.1/a", "https://10.0.0.5/a", "https://[::1]/a"])(
    "refuses the private IP literal %s without a DNS lookup",
    async (href) => {
      const { transport, resolved } = fakeTransport({}, {});

      await expect(fetchPublicHttps(url(href), MAX, transport)).rejects.toThrow(
        PublicFetchError,
      );
      expect(resolved).toEqual([]);
    },
  );

  it("refuses a hostname whose NAT64 (DNS64) address embeds a private IPv4", async () => {
    const { transport, connected } = fakeTransport(
      { "nat.example": ["64:ff9b::a00:7"] },
      {},
    );

    await expect(
      fetchPublicHttps(url("https://nat.example/a"), MAX, transport),
    ).rejects.toThrow("non-public address 64:ff9b::a00:7");
    expect(connected).toEqual([]);
  });

  it("refuses a hostname when any resolved address is private", async () => {
    const { transport, connected } = fakeTransport(
      { "evil.example": [PUBLIC_IP, "192.168.1.10"] },
      { "https://evil.example/a": { body: "x" } },
    );

    await expect(
      fetchPublicHttps(url("https://evil.example/a"), MAX, transport),
    ).rejects.toThrow("non-public address 192.168.1.10");
    expect(connected).toEqual([]);
  });

  it("refuses a redirect to a private host or to http", async () => {
    const { transport, connected } = fakeTransport(
      { "cdn.example": [PUBLIC_IP], "internal.example": ["10.0.0.7"] },
      {
        "https://cdn.example/a": {
          status: 302,
          headers: { location: "https://internal.example/meta" },
        },
        "https://cdn.example/b": {
          status: 301,
          headers: { location: "http://cdn.example/b" },
        },
      },
    );

    await expect(
      fetchPublicHttps(url("https://cdn.example/a"), MAX, transport),
    ).rejects.toThrow("non-public address 10.0.0.7");
    await expect(
      fetchPublicHttps(url("https://cdn.example/b"), MAX, transport),
    ).rejects.toThrow("unsupported scheme");
    expect(connected).toEqual([PUBLIC_IP, PUBLIC_IP]);
  });

  it("fetches a public https URL through the address it checked", async () => {
    const { transport, connected, resolved } = fakeTransport(
      { "ipfs.io": [PUBLIC_IP] },
      {
        "https://ipfs.io/ipfs/Qm1": {
          status: 302,
          headers: { location: "/ipfs/Qm1/" },
        },
        "https://ipfs.io/ipfs/Qm1/": {
          headers: { "content-type": "application/json; charset=utf-8" },
          body: "{}",
        },
      },
    );

    const result = await fetchPublicHttps(
      url("https://ipfs.io/ipfs/Qm1"),
      MAX,
      transport,
    );

    expect(result.type).toBe("application/json");
    expect(Buffer.from(result.bytes).toString()).toBe("{}");
    expect(resolved).toEqual(["ipfs.io", "ipfs.io"]);
    expect(connected).toEqual([PUBLIC_IP, PUBLIC_IP]);
  });

  it("stops reading past the size cap", async () => {
    const { transport } = fakeTransport(
      { "cdn.example": [PUBLIC_IP] },
      { "https://cdn.example/big": { body: new Uint8Array(MAX + 1) } },
    );

    await expect(
      fetchPublicHttps(url("https://cdn.example/big"), MAX, transport),
    ).rejects.toThrow("too large");
  });
});
