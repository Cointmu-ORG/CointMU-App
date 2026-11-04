import { describe, expect, it } from "vitest";
import {
  buildGethHttpArgs,
  buildGethIpcArgs,
  buildGethPeerArgs,
  resolveGethVerbosity,
} from "./gethArgs";

const RPC_PORT = 8585;

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe("buildGethHttpArgs", () => {
  const args = buildGethHttpArgs(RPC_PORT);

  it("binds to loopback on the given port", () => {
    expect(flagValue(args, "--http.addr")).toBe("127.0.0.1");
    expect(flagValue(args, "--http.port")).toBe(String(RPC_PORT));
  });

  it("exposes only eth, net and web3", () => {
    expect(flagValue(args, "--http.api")).toBe("eth,net,web3");
  });

  it("sends no CORS header and pins the Host allow-list", () => {
    expect(args).not.toContain("--http.corsdomain");
    expect(flagValue(args, "--http.vhosts")).toBe("localhost,127.0.0.1");
  });

  it("never uses a wildcard", () => {
    expect(args.some((arg) => arg.includes("*"))).toBe(false);
  });
});

describe("buildGethIpcArgs", () => {
  it("points geth at the private endpoint", () => {
    expect(buildGethIpcArgs("/home/u/.config/CointMU/ipc/geth.ipc")).toEqual([
      "--ipcpath",
      "/home/u/.config/CointMU/ipc/geth.ipc",
    ]);
  });

  it("disables IPC rather than using geth's default location", () => {
    expect(buildGethIpcArgs(null)).toEqual(["--ipcdisable"]);
  });
});

describe("buildGethPeerArgs", () => {
  it("passes the Max peers setting", () => {
    expect(buildGethPeerArgs(25)).toEqual(["--maxpeers", "25"]);
  });

  it.each([undefined, 0, -3, 2.5, "50"])(
    "falls back to 14 for %s",
    (stored) => {
      expect(buildGethPeerArgs(stored)).toEqual(["--maxpeers", "14"]);
    },
  );
});

describe("resolveGethVerbosity", () => {
  it("maps Debug to 4 and Info to 3", () => {
    expect(resolveGethVerbosity("debug", undefined)).toBe("4");
    expect(resolveGethVerbosity("info", undefined)).toBe("3");
  });

  it.each(["warn", "error", undefined, 7])(
    "keeps the info lines the app parses for %s",
    (stored) => {
      expect(resolveGethVerbosity(stored, undefined)).toBe("3");
    },
  );

  it("lets GETH_LOG_VERBOSITY win", () => {
    expect(resolveGethVerbosity("info", "5")).toBe("5");
    expect(resolveGethVerbosity("debug", "2")).toBe("2");
  });

  it("ignores an empty GETH_LOG_VERBOSITY", () => {
    expect(resolveGethVerbosity("debug", "")).toBe("4");
  });
});
