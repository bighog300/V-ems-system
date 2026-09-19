# Windows-native Android development

This is the normal Android development topology for VEMS:

```text
Pixel Tablet -> http://10.0.2.2:3001 -> Windows host -> Docker Desktop API
Pixel Tablet -> http://10.0.2.2:8081 -> Windows-native Metro
```

The API container uses Compose DNS (`redis`, `openemr`, and `vtiger`) and the
retained bind-mounted SQLite database at `/var/lib/vems/data/platform.sqlite`.
The host mapping is `3001:3001`; Metro is native Windows port 8081. Normal
operation needs no WSL networking, portproxy, ADB reverse, socat, remote ADB,
or Maestro-in-WSL. The earlier hybrid bridge and Maestro flows remain useful
legacy/diagnostic evidence only.

## Prerequisites

- Docker Desktop with Linux containers.
- Windows Git, Node.js/npm, Android Studio, JDK 17, and Windows `adb.exe`.
- Repository checkout: `E:\EvidessaDev\repos\V-ems-system`.
- Android project: `E:\EvidessaDev\repos\V-ems-system\apps\mobile-crew\android`.
- Android SDK: `E:\EvidessaDev\android\sdk`.

Runtime secrets are supplied from an ignored local runtime file or process
environment. Never put them in Git, the image, Expo public configuration, or a
Windows checkout. The existing protected `infra/.env.development` files are
not part of this workflow.

## Synchronize a Windows checkout without sharing Git objects

From WSL, after committing or otherwise checkpointing the intended source:

```bash
git bundle create /tmp/vems-stage14.bundle stage14/field-validation-release-readiness
```

In Windows PowerShell, create a real clone from that bundle (never
`--shared`), verify the branch and commit, then remove the bundle:

```powershell
git clone E:\path\to\vems-stage14.bundle E:\EvidessaDev\repos\V-ems-system
Set-Location E:\EvidessaDev\repos\V-ems-system
git switch stage14/field-validation-release-readiness
git rev-parse HEAD
Remove-Item E:\path\to\vems-stage14.bundle
```

Do not copy environment files, OAuth/JWT files, databases, certificates,
captures, APKs, or runtime state. Future updates can use a new bundle or a
normal fetch from an approved commit source; do not share `.git` object storage
across filesystems.

## Start the Docker API

From the WSL checkout, provide the required Compose variables through an
ignored runtime file or process environment, then run:

```bash
docker compose -f infra/docker-compose.dev.yml --env-file infra/.env.development up -d --build
curl --fail http://127.0.0.1:3001/health
```

The API image runs as the non-root `node` user. Only
`services/api-gateway/.data` is bind-mounted, and the API refuses to start if
`platform.sqlite` is missing. It never selects `.data/platform.development.sqlite`.
Use `docker compose ... ps` and sanitized logs for diagnosis; do not print
resolved Compose configuration containing secrets.

Before and after retained-database validation, record the path, owner/mode,
SHA-256, `PRAGMA integrity_check`, and the clinical counts. A read-only check
can use `sqlite3` with `-readonly`; do not run clinical flows during topology
migration. The protected Stage 14 baseline remains PCR-000001 with one
encounter, one assessment, zero observations/audit events; PCR-000002 is
unchanged and PCR-000003 remains absent.

## Windows Metro

```powershell
Set-Location E:\EvidessaDev\repos\vems\V-ems-system
.\scripts\windows\start-mobile-metro.ps1 -EnableDevelopmentTestAuth
```

The switch is optional and is the only way this launcher enables the
development test-auth flag. Dependencies are not installed automatically;
use `-InstallDependencies` explicitly when required. Verify Metro at
`http://127.0.0.1:8081/status`, then the emulator at
`http://10.0.2.2:8081/status`.

The app's explicit Android-emulator development profile resolves its API to
`http://10.0.2.2:3001`. Physical devices use an explicit LAN, Tailscale, or
production URL via `EXPO_PUBLIC_API_URL`. Release configuration rejects the
emulator profile and requires an explicit API URL. Session persistence stores
the resolved URL with the session, so development test login and restored
sessions use the same API endpoint.

## Build and run on Windows

```powershell
Set-Location E:\EvidessaDev\repos\vems\V-ems-system
Set-Location .\apps\mobile-crew
npm ci
npm run test:config
npx expo prebuild --platform android --no-install
Set-Location .\android
$env:JAVA_HOME = 'E:\EvidessaDev\tools\jdk-17'
$env:ANDROID_HOME = 'E:\EvidessaDev\android\sdk'
.\gradlew.bat assembleDebug --no-daemon
Get-FileHash .\app\build\outputs\apk\debug\app-debug.apk -Algorithm SHA256
& 'E:\EvidessaDev\android\sdk\platform-tools\adb.exe' install -r .\app\build\outputs\apk\debug\app-debug.apk
& 'E:\EvidessaDev\android\sdk\platform-tools\adb.exe' shell monkey -p org.vems.mobilecrew 1
& 'E:\EvidessaDev\android\sdk\platform-tools\adb.exe' logcat -v time '*:S' ReactNative:V ReactNativeJS:V
```

Use `connectedDebugAndroidTest` for connected instrumentation tests when the
native project contains them. The project currently has no committed native
instrumentation suite. The precise smallest next step is: after `expo
prebuild`, add `android/app/src/androidTest/java/org/vems/mobilecrew/LoginSmokeTest.kt`,
enable the AndroidX test runner plus Espresso test dependencies in the
generated Android project, launch `MainActivity`, and assert the existing
`login-screen`, `input-api-base-url`, and `submit-sign-in` identities without
pressing a clinical action. Use UIAutomator only for system UI (for example,
the permission dialog). Run it with `./gradlew connectedDebugAndroidTest` on
Windows. Keep the generated-project change reproducible through Expo config;
do not clear app data or SecureStore.

## Health, adapters, and shutdown

Use the API `/health`, readiness endpoint, and correlated request IDs to check
assignments and adapter traffic. OpenEMR and Vtiger are reached by their
Compose service names, not host-published ports. Do not touch shared OpenEMR
on port 8083. Stop without deleting volumes:

```bash
docker compose -f infra/docker-compose.dev.yml stop api openemr vtiger redis mysql
```

If a health check fails, inspect service status, Docker Desktop networking,
runtime variables, and the retained database mount. Never recreate retained
volumes as a troubleshooting step.

## Legacy evidence and clinical safety

The previous WSL bridge, direct ADB, portproxy, socat, and Maestro-in-WSL
topology is superseded for normal Windows Android development but its Stage 14
evidence and flows are retained. This migration does not perform the pending
C2 observation mutation: PCR-000001 remains one encounter, one assessment,
and zero observations.
