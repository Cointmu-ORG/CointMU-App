#!/usr/bin/env bash
# Builds the macOS geth into resources/bin/mac/geth (#102).
#
# go-ethereum published no darwin-arm64 build of 1.10.26 (gethstore has
# arm64 only from 1.13.10), so it is built here from the v1.10.26 tag with
# CGO on, the way upstream builds it (build/ci.go install). Go is
# .go-version: the official 1.10.26 binaries used go1.18.5, but go1.18 cgo
# fails on current Xcode clang ("malformed DWARF TagVariable entry", fixed
# in 1.19.8), and 1.19 was the current Go when v1.10.26 was tagged.
# The Linux, Windows and old Intel macOS binaries in resources/bin are the
# official gethstore downloads; this one cannot be, so its sha256 is pinned
# below instead and a different build fails.
#
# Runs on an Apple Silicon Mac (the release job's macos runner). Needs git,
# the Xcode command line tools, and that Go release on PATH.
set -euo pipefail

readonly GETH_REPO=https://github.com/ethereum/go-ethereum.git
readonly GETH_TAG=v1.10.26
# The commit v1.10.26 points at, as in `geth version` of the other binaries.
readonly GETH_COMMIT=e5eb32acee19cc9fca6a03b10283b7484246b15a
# sha256 of build/bin/geth as built from GETH_COMMIT with .go-version and
# Xcode 26.6 (release.yml DEVELOPER_DIR); two separate runners built the same
# bytes. Another Xcode or Go changes it: check the build log's `geth version`,
# then set it to the hash the failure prints.
readonly EXPECTED_SHA256=bbf159d537c932bedac76dba950c1174fb2213419721a1d9072b4725ebe6b270

script_dir=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
readonly out="$repo_root/resources/bin/mac/geth"
go_version=$(tr -d '[:space:]' <"$script_dir/.go-version")
readonly go_version

fail() {
  echo "::error::mac geth: $*" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail "build it on macOS, not $(uname -s)"
[ "$(uname -m)" = arm64 ] || fail "build it on Apple Silicon, not $(uname -m)"
actual_go=$(go env GOVERSION)
[ "$actual_go" = "go$go_version" ] ||
  fail "needs go$go_version (scripts/mac-geth/.go-version), found $actual_go"

src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

git clone --quiet --depth 1 --branch "$GETH_TAG" "$GETH_REPO" "$src"
head=$(git -C "$src" rev-parse HEAD)
[ "$head" = "$GETH_COMMIT" ] || fail "$GETH_TAG is $head, expected $GETH_COMMIT"
# On a detached HEAD ci.go leaves the commit date out of `geth version`.
git -C "$src" checkout --quiet -b "build-$GETH_TAG"

(cd "$src" && CGO_ENABLED=1 go run build/ci.go install ./cmd/geth)
built="$src/build/bin/geth"

file "$built" | grep -q 'Mach-O 64-bit executable arm64' ||
  fail "not an arm64 executable: $(file "$built")"
# The arm64 linker signs ad hoc; macOS kills an unsigned arm64 binary.
codesign --verify --verbose=2 "$built"
"$built" version

sha=$(shasum -a 256 "$built" | cut -d ' ' -f 1)
echo "geth darwin-arm64 sha256: $sha"
[ "$sha" = "$EXPECTED_SHA256" ] ||
  fail "sha256 is $sha, expected $EXPECTED_SHA256 (see EXPECTED_SHA256 in scripts/mac-geth/build.sh)"

mkdir -p "$(dirname "$out")"
install -m 0755 "$built" "$out"
echo "Wrote $out"
