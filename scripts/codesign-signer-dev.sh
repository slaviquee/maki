#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SIGNER_DIR="$ROOT_DIR/signer-daemon"
ENTITLEMENTS="$SIGNER_DIR/MakiSigner.entitlements"
BINARY="$SIGNER_DIR/.build/arm64-apple-macosx/debug/maki-signer"

if [ ! -f "$BINARY" ]; then
  echo "ERROR: signer binary not found at $BINARY"
  echo "Run 'cd signer-daemon && swift build' first."
  exit 1
fi

if [ ! -f "$ENTITLEMENTS" ]; then
  echo "ERROR: entitlements file not found at $ENTITLEMENTS"
  exit 1
fi

echo "Ad-hoc signing $BINARY..."
codesign --force -s - --identifier com.slava.maki-signer --entitlements "$ENTITLEMENTS" "$BINARY"
echo "Done."
