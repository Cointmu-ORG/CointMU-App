// Creates an isolated app profile for the AppImage check. Two layers keep the
// test node off any real network:
// 1. The app runs only inside nsfuse.sh's network namespace (loopback only), so
//    no packet leaves the machine, even if it falls back to its built-in bootnode.
// 2. The profile itself: a test chain id, so geth runs with another --networkid
//    and datadir and a real peer fails the handshake; the only bootnode is a dead
//    local enode (a valid key, or the app would reject it and use the built-in
//    one); a random P2P port.
// usage: node mkprofile.mjs <dir>   (deletes <dir> first)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const TEST_CHAIN_ID = 19129;
const DEAD_BOOTNODE_PORT = 30399;
const P2P_PORT_BASE = 30400;
const P2P_PORT_RANGE = 500;
const [dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: node mkprofile.mjs <dir>");
const { Wallet } = createRequire(import.meta.url)("ethers");
// Drop the 0x04 prefix: 128 hex digits, a valid secp256k1 point.
const publicKey = Wallet.createRandom().signingKey.publicKey.slice(4);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, "xdg/CointMU"), { recursive: true });
fs.mkdirSync(path.join(dir, "home"));
const config = {
  network: {
    chainId: TEST_CHAIN_ID,
    listenPort: P2P_PORT_BASE + Math.floor(Math.random() * P2P_PORT_RANGE),
    bootnodes: [`enode://${publicKey}@127.0.0.1:${DEAD_BOOTNODE_PORT}`],
  },
};
fs.writeFileSync(
  path.join(dir, "xdg/CointMU/config.json"),
  JSON.stringify(config),
);
console.log(dir);
