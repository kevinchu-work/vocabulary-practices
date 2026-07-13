#!/usr/bin/env bash
# Builds the executable and wraps it in a minimal .app bundle (menu-bar accessory).
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="SpellingLookup"
CONFIG="release"
# Build outside iCloud-synced ~/Documents — SwiftPM's SQLite build.db throws
# "disk I/O error" on iCloud-backed paths.
SCRATCH="${TMPDIR:-/tmp}/spelling-build"

echo "Building ($CONFIG)…"
swift build -c "$CONFIG" --scratch-path "$SCRATCH"

BIN="$(swift build -c "$CONFIG" --scratch-path "$SCRATCH" --show-bin-path)/$APP_NAME"
APP_DIR="build/$APP_NAME.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$BIN" "$MACOS_DIR/$APP_NAME"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>$APP_NAME</string>
    <key>CFBundleExecutable</key><string>$APP_NAME</string>
    <key>CFBundleIdentifier</key><string>com.spelling.lookup</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>13.0</string>
    <key>LSUIElement</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST

echo "Built $APP_DIR"
echo "Run it with:  open \"$APP_DIR\""
