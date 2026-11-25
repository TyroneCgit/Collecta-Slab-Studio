#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$source_dir/build"
destination="$source_dir/build/Slab Studio 4.app"
stage="$(mktemp -d "${TMPDIR:-/tmp}/slab4-build.XXXXXXXX")"
trap 'rm -rf "$stage"' EXIT

web_files=(index.html studio.css studio.js artwork.js renderer.js usdz.js)
for file in "${web_files[@]}"; do
    if [[ ! -f "$source_dir/$file" ]]; then
        echo "The editor is missing $file." >&2
        exit 1
    fi
done

contents="$stage/Slab Studio 4.app/Contents"
mkdir -p "$contents/Resources" "$contents/MacOS" "$stage/module-cache"
xcrun --sdk macosx swiftc -O -swift-version 5 -module-cache-path "$stage/module-cache" \
    -target "$(uname -m)-apple-macos13.0" \
    "$source_dir/native/StudioBridge.swift" "$source_dir/native/main.swift" \
    -o "$contents/MacOS/SlabStudio4"
cp "$source_dir/native/Info.plist" "$contents/Info.plist"
mkdir -p "$contents/Resources/web"
xcrun --sdk macosx swift -module-cache-path "$stage/module-cache" "$source_dir/native/make-icon.swift" "$contents/Resources/SlabStudio4.icns"
for file in "${web_files[@]}"; do
    cp "$source_dir/$file" "$contents/Resources/web/$file"
done
codesign --force --sign - --entitlements "$source_dir/native/Studio.entitlements" \
    "$stage/Slab Studio 4.app"
codesign --verify --strict "$stage/Slab Studio 4.app"

if [[ -e "$destination" ]]; then
    identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$destination/Contents/Info.plist" 2>/dev/null || true)"
    if [[ "$identifier" != "studio.slab.local-editor-4" ]]; then
        echo "A different application already exists at $destination." >&2
        exit 1
    fi
    mv "$destination" "$stage/previous.app"
fi
if ! mv "$stage/Slab Studio 4.app" "$destination"; then
    if [[ -d "$stage/previous.app" ]]; then mv "$stage/previous.app" "$destination"; fi
    exit 1
fi
echo "Built $destination"
