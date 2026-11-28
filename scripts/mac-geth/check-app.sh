#!/usr/bin/env bash
# Checks a packaged CointMU.app (#102): signature, bundled geth, and that the
# bundled geth initialises our chain. Every check fails the run.
#
# The geth init runs in a temporary datadir; the read-back node starts with
# no discovery, no peers, no NAT and no IPC, and never mines.
#
# Usage: check-app.sh <path/to/CointMU.app>
set -euo pipefail

readonly EXPECTED_CHAIN_ID_HEX=0x778 # 1912
# Genesis hash of src/main/geth/process/genesis.ts, from `geth init`.
readonly EXPECTED_GENESIS_HASH=0xe878d2f989a140f72c9a5f3afbaa2cd37740efaf1215ddda04b19a759fdd36ac
readonly EXPECTED_VERSION="Version: 1.10.26-stable"
readonly EXPECTED_COMMIT="Git Commit: e5eb32acee19cc9fca6a03b10283b7484246b15a"
readonly EXPECTED_COMMIT_DATE="Git Commit Date: 20221103"

fail() {
  echo "::error::mac app check: $*" >&2
  exit 1
}

app=${1:?usage: check-app.sh <path/to/CointMU.app>}
[ -d "$app" ] || fail "$app is not a directory"
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
geth="$app/Contents/Resources/bin/mac/geth"

echo "== codesign --verify --deep --strict"
codesign --verify --deep --strict --verbose=2 "$app"
codesign --display --verbose=2 "$app" 2>&1 | tee /dev/stderr |
  grep -q '^Signature=adhoc$' || fail "the app is not signed ad hoc"

echo "== bundled geth"
[ -x "$geth" ] || fail "$geth is missing or not executable"
file "$geth" | tee /dev/stderr | grep -q 'Mach-O 64-bit executable arm64' ||
  fail "bundled geth is not an arm64 executable"
codesign --verify --strict --verbose=2 "$geth"

echo "== geth version"
version=$("$geth" version)
echo "$version"
grep -qx "$EXPECTED_VERSION" <<<"$version" || fail "expected $EXPECTED_VERSION"
grep -qx "$EXPECTED_COMMIT" <<<"$version" || fail "expected $EXPECTED_COMMIT"
grep -qx "$EXPECTED_COMMIT_DATE" <<<"$version" ||
  fail "expected $EXPECTED_COMMIT_DATE"
grep -qx "Architecture: arm64" <<<"$version" || fail "expected arm64"

echo "== geth init"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Not through npx: npm 12 takes tsx's -e as its own flag.
(cd "$repo_root" && ./node_modules/.bin/tsx -e \
  'import { GENESIS_BLOCK } from "./src/main/geth/process/genesis"; process.stdout.write(JSON.stringify(GENESIS_BLOCK));') \
  >"$work/genesis.json"
"$geth" --log.json --datadir "$work/data" init "$work/genesis.json" \
  2>"$work/init.log" || { cat "$work/init.log"; fail "geth init failed"; }
cat "$work/init.log"
grep '"msg":"Successfully wrote genesis state"' "$work/init.log" |
  grep -q "\"database\":\"chaindata\",\"hash\":\"$EXPECTED_GENESIS_HASH\"" ||
  fail "genesis hash is not $EXPECTED_GENESIS_HASH"

echo "== chain id and genesis read back from the datadir"
readback=$("$geth" --datadir "$work/data" --networkid 1912 --nodiscover \
  --maxpeers 0 --nat none --port 0 --ipcdisable --verbosity 1 \
  --exec 'eth.chainId() + " " + eth.getBlock(0).hash' console)
echo "$readback"
[ "$readback" = "\"$EXPECTED_CHAIN_ID_HEX $EXPECTED_GENESIS_HASH\"" ] ||
  fail "expected chain id $EXPECTED_CHAIN_ID_HEX and genesis $EXPECTED_GENESIS_HASH"

echo "== Electron loads under the ad-hoc signature"
# Library validation would refuse the frameworks here (hardenedRuntime).
electron_version=$(ELECTRON_RUN_AS_NODE=1 "$app/Contents/MacOS/CointMU" \
  -p 'process.versions.electron')
echo "Electron $electron_version"

echo "mac app check passed"
