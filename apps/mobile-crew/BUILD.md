# Building mobile-crew

This app is an Expo (managed workflow) project — there is no committed
`android/` or `ios/` native project; both are generated on demand by
`expo prebuild` from `app.json`. That's what makes these builds
reproducible: the native project is a deterministic function of the
versioned config (`app.json`, `eas.json`, the installed dependency
versions), not hand-edited Xcode/Android Studio state.

## App identifiers

- Android application ID: `org.vems.mobilecrew`
- iOS bundle identifier: `org.vems.mobilecrew`

Bump `android.versionCode` and `ios.buildNumber` in `app.json` for each
release build (EAS's `production` profile does this automatically via
`autoIncrement: true` — see `eas.json`).

## Option A — EAS Build (recommended, works for both platforms)

[EAS Build](https://docs.expo.dev/build/introduction/) builds in Expo's
cloud, so it doesn't require a local Android SDK/JDK or a macOS/Xcode
machine for iOS. This is the primary path for release builds.

```sh
cd apps/mobile-crew
npx eas-cli login                 # once, with an Expo account for this project
npx eas-cli build:configure       # links this project to an EAS project, once

# Debug/dev-client build, installable directly (Android) or via simulator (iOS):
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development

# Internal test build (Android APK, ad-hoc iOS):
npx eas-cli build --platform android --profile preview

# Store release build (Android App Bundle, iOS archive):
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

Build profiles are defined in `eas.json`. `production` sets
`autoIncrement: true`, so `android.versionCode`/`ios.buildNumber` bump
automatically per build rather than needing a manual edit.

## Option B — Local Android debug build

Requires a local Android SDK (`ANDROID_HOME` set, `platform-tools` +
a build-tools/platform matching this Expo SDK) and JDK 17.

```sh
cd apps/mobile-crew
npx expo prebuild --platform android   # generates ./android (gitignored)
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android` (`expo start --android`) is the faster day-to-day loop
against Expo Go or a dev client and doesn't require any of the above —
use it for development; use the steps above only when you need an
installable APK outside of Expo Go.

## Option C — CI-produced debug APK

`.github/workflows/mobile-crew-android-build.yml` runs the same
prebuild + `gradlew assembleDebug` steps above on GitHub's
`ubuntu-latest` runners (which ship a JDK 17 toolchain and Android SDK),
on every push/PR touching `apps/mobile-crew/**`, and uploads the
resulting `app-debug.apk` as a workflow artifact. This is the easiest
way to get a real installable APK without setting up an Android SDK
locally, and it doubles as regression coverage that `app.json`'s native
config keeps generating a buildable project as dependencies change.

## iOS

Building an iOS `.ipa` requires macOS + Xcode (Apple's toolchain isn't
available on Linux), so there is no local/CI option equivalent to the
Android debug workflow above in this repository's Linux-only CI. EAS
Build (Option A) is the supported path for iOS builds — it runs the
Xcode toolchain on Expo's macOS build workers.

## Signing

Local `assembleDebug` builds use the Android SDK's default debug
keystore, so those APKs aren't installable as an update over a
production install and can't go to any app store — debug/dev-client
builds only. Release signing (Android upload key, iOS distribution
certificate/provisioning profile) is managed by `eas.json`'s `production`
profile and EAS's credential storage; provisioning real signing
credentials is a deployment/ops task outside this repo's source control
and is intentionally not covered here.
