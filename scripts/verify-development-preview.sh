#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

app_path="$repo_dir/src-tauri/target/release/bundle/macos/Ministry of Elsewhere.app"
executable_path="$app_path/Contents/MacOS/ministry-of-elsewhere"
plist_path="$app_path/Contents/Info.plist"

npm ci
npm test
npm run check
npm run build
npm audit --omit=dev
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

if [ -e "$app_path" ]; then
  rm -rf "$app_path"
fi
npm run tauri build -- --bundles app

test -f "$executable_path"
test -f "$plist_path"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$plist_path")" = "Ministry of Elsewhere"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist_path")" = "0.8.0"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist_path")" = "1"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist_path")" = "13.0"
file "$executable_path" | grep -q 'arm64'
codesign --force --deep --sign - "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"

printf '%s\n' "Verified development preview: $app_path"
shasum -a 256 "$executable_path"
printf '%s\n' "This verifies a development build only; it does not prove Developer ID signing, notarization, stapling, Gatekeeper acceptance, or clean-Mac behavior."
