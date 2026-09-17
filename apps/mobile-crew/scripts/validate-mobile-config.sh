#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_root"

config=$(npx expo config --json)
printf '%s' "$config" | node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const config = JSON.parse(input);
  if (config.scheme !== "vems-mobilecrew") throw new Error("scheme mismatch");
  if (config.android?.package !== "org.vems.mobilecrew") throw new Error("Android package mismatch");
});
'

npx expo prebuild --platform android --no-install >/tmp/vems-mobile-config-prebuild.log
manifest="$project_root/android/app/src/main/AndroidManifest.xml"
test -f "$manifest"
rg -q 'android:name="\.MainActivity"' "$manifest"
rg -q "applicationId ['\"]org\.vems\.mobilecrew['\"]" "$project_root/android/app/build.gradle"
rg -q 'android:name="android\.intent\.action\.VIEW"' "$manifest"
rg -q 'android:name="android\.intent\.category\.BROWSABLE"' "$manifest"
rg -q 'android:scheme="vems-mobilecrew"' "$manifest"
rg -q 'android:scheme="exp\+mobile-crew"' "$manifest"
printf '%s\n' 'mobile config: scheme/package/generated manifest PASS'
