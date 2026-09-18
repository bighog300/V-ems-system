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
  if (config.extra?.enableDevelopmentTestAuth !== false) throw new Error("development test auth must default off");
});
'

enabled_config=$(EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH=true NODE_ENV=development APP_ENV=development npx expo config --json)
printf '%s' "$enabled_config" | node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const config = JSON.parse(input);
  if (config.extra?.enableDevelopmentTestAuth !== true) throw new Error("development test auth flag was not exposed in explicit development config");
});
'

release_config=$(EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH=true NODE_ENV=production APP_ENV=production npx expo config --json)
printf '%s' "$release_config" | node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  const config = JSON.parse(input);
  if (config.extra?.enableDevelopmentTestAuth !== false) throw new Error("release config exposed development test auth");
});
'

if rg -n -i 'JWT_HS256_SECRET|JWT_ISSUER|JWT_AUDIENCE|OPENEMR_CLIENT_SECRET|OPENEMR_PASSWORD|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY' \
  app.config.js src scripts --glob '!**/*.test.*' --glob '!scripts/validate-mobile-config.sh' --glob '!**/node_modules/**'; then
  echo 'secret-like configuration found in mobile sources' >&2
  exit 1
fi

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
