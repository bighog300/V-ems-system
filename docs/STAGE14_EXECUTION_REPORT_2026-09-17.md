# Stage 14 Local Emulator Execution Report

Status: **INCOMPLETE — emulator startup and reachable login validation demonstrated; service-backed and broader acceptance gates remain open**

Execution date: 2026-09-17 (Europe/London)

## Safety, worktree, and Git diagnosis

Protected files were preserved without overwrite or commit:

```text
infra/.env.development
infra/.env.development.bak
docs/STAGE14_EXECUTION_REPORT_2026-09-17.md
```

The pre-existing API URL change in `infra/.env.development` was preserved. No protected environment file was modified. No push, publish, merge, tag, or completion claim was made.

Current worktree status:

```text
 M apps/mobile-crew/src/screens/LoginScreen.tsx
 M apps/mobile-crew/test/LoginScreen.jest.test.tsx
 M infra/.env.development
?? docs/STAGE14_EXECUTION_REPORT_2026-09-17.md
?? infra/.env.development.bak
```

The two mobile changes are the narrow product fix and regression test described below. No Stage 14 branch was created because the write probe failed.

Exact Git diagnosis: `pwd` was `/home/bighog/repos/vems/V-ems-system`; `findmnt` reported ext4 `rw,nosuid,nodev,relatime,discard,errors=remount-ro,data=ordered`; `.git`, `.git/HEAD`, and `.git/refs` were owned by `bighog:bighog` with normal modes; `getfacl` produced no ACL output. The safe probe `: > .git/.stage14-write-test.<pid>` failed with `/bin/bash: ... Read-only file system`. Thus ownership, POSIX mode, ACL output, and mount options do not explain the failure. The exact observed cause is an external/managed filesystem write policy returning `EROFS` for `.git` despite the mount reporting `rw`. No recursive chmod/chown was attempted.

## Environment verification

| Check | Result |
|---|---|
| Docker daemon | PASS — `docker info`, Docker Desktop server 29.6.2 |
| npm registry | PASS — registry HEAD request returned HTTP 200 |
| Windows adb | PASS — `/mnt/e/EvidessaDev/android/sdk/platform-tools/adb.exe` |
| Emulator | PASS — `emulator-5554 device`, sdk_gphone64_x86_64, API 35 |
| JDK | PASS — `E:\EvidessaDev\tools\jdk-17\bin\java.exe`, Temurin/OpenJDK 17.0.20.1 |
| Android SDK | PASS — `E:\EvidessaDev\android\sdk`, build tools 36.0.0/SDK/NDK available |
| Additional emulator | NONE STARTED |

No Docker volumes or protected configuration were deleted.

## Dependency repair and automated validation

Dependency repair used the committed lockfile without changing dependency versions:

```text
npm ci --prefer-online --no-audit --no-fund
```

Results: `npm run lint` PASS (`lint ok (202 files)`); complete repository `npm test` remains FAIL with orchestration 40 passed / 3 failed because required service state was unavailable; mobile TypeScript PASS; Android export and prebuild PASS. Expo Doctor remained blocked by local CLI resolution/network path; standalone `npx expo-doctor` was unavailable in the prior environment.

### Component timeout diagnosis

The original parallel component run had these 12 failures, each timing out at 20,000 ms. Suite durations were:

```text
VitalsScreen — does not show a repeat action when there is no history yet — 64.373 s
LoginScreen — keeps sign-in disabled until every field is filled — 64.784 s
JobsListScreen — loads and renders assigned jobs, then navigates to the selected one — 66.160 s
SyncStatusScreen — shows an empty state when nothing is queued — 65.761 s
IncidentWorkspaceScreen — shows a placeholder in the detail pane until a job is selected from the rail, then shows its detail — 65.488 s
DispositionScreen — attaches captured coordinates to the disposition save when location permission is granted — 67.311 s
NotesScreen — shows an empty state when nothing has been recorded yet — 67.372 s
IncidentDetailScreen — shows the status stepper with a Navigate button, and advances status when the primary action is pressed — 66.551 s
PatientCaseDetailScreen — shows an empty state when nothing has been captured yet — 67.424 s
BarcodeScannerModal — shows the camera view and reports a scanned code once — 44.286 s
PatientIdentityScreen — defaults to name+DOB+address mode and searches with those fields plus address — 69.754 s
InterventionsScreen — repeat medication pre-fills the medication form from that history row — 69.145 s
```

Serial command: `npx jest --runInBand --verbose --json --outputFile=/tmp/stage14-component-serial.json`. Result: PASS — 18/18 suites, 73/73 tests, 41.52 s. A normal parallel rerun also passed 18/18 and 73/73 in 5.035 s. The deterministic trigger was the React Native invariant `ScrollView child layout (["justifyContent"]) must be applied through the contentContainerStyle prop` in `LoginScreen`, which caused the runtime redbox and test waits to time out. The narrow fix moves vertical alignment to `containerContent`; the regression test checks that prop. No timeout was increased and no assertion was weakened.

## Android build evidence

| Field | Value |
|---|---|
| Application ID | `org.vems.mobilecrew` |
| Version name/code | `1.0.0` / `1` |
| Variant | `debug` |
| Signing | debug signing config / generated debug keystore; not production signed |
| Absolute APK path | `/mnt/e/s14b/apps/mobile-crew/android/app/build/outputs/apk/debug/app-debug.apk` |
| SHA-256 | `852AB4183DEEF07AE6C97BE93058921C41415D4A0DDA2AB9A1DA8FA9E558638F` |

Build command: `Set-Location E:\s14b\apps\mobile-crew\android; $env:JAVA_HOME='E:\EvidessaDev\tools\jdk-17'; $env:ANDROID_HOME='E:\EvidessaDev\android\sdk'; .\gradlew.bat assembleDebug --no-daemon`. It completed successfully. A separate release/JSC experiment is not acceptance evidence: release packaging hit Windows Device Guard blocking `hermesc`, and the retry still produced a runtime `libhermestooling.so` failure. The debug APK was restored for emulator validation.

## Metro, adb, launch, and filtered logcat evidence

The required command was run from `E:\s14b\apps\mobile-crew`: `npx expo start --dev-client --clear --localhost`. It reported `packager-status:running` but the Windows localhost instance listened only on `[::1]:8081`, while the emulator requests `10.0.2.2:8081`. The WSL mount separately returned `EROFS` when Expo tried to write `.expo/dev/logs/start.log`.

For direct emulator reachability, the patched project was then served on tcp:8081 in LAN host mode. Windows evidence was `TCP 0.0.0.0:8081 LISTENING` and `packager-status:running`. The served bundle contained `contentContainerStyle: styles.containerContent`. The requested `adb reverse tcp:8081 tcp:8081` was configured. All adb operations used `/mnt/e/EvidessaDev/android/sdk/platform-tools/adb.exe`.

The debug APK installed successfully, `org.vems.mobilecrew` was force-stopped and relaunched, and a live process was observed. Filtered logcat directly showed `ReactHost ... isMetroRunning(): Async result = true`, `loadJSBundleFromMetro()`, and `ReactNativeJS: Running "main"`. No redbox, `Unable to load script`, invariant, fatal exception, JavaScript exception, database migration error, or networking failure was observed after the corrected listener was used. Non-fatal generated-setter and emulator frame-skip warnings were present.

## Emulator acceptance matrix — synthetic data only

| Scenario | Result | Direct evidence |
|---|---|---|
| Emulator online | PASS | Windows adb listed `emulator-5554 device` |
| APK install | PASS | adb returned `Success` |
| Native activity/process launch | PASS | monkey success; live PID observed |
| Metro packager status | PASS | `packager-status:running` on tcp:8081 |
| JavaScript bundle loads | PASS | Metro is running, bundle loads, `Running "main"` |
| First successfully rendered screen | PASS | UIAutomator showed `V-EMS Crew` login screen |
| Login form initial validation | PASS | Four fields visible and `submit-sign-in` was disabled before complete input |
| Synthetic sign-in/session | NOT EXECUTED | No backend/session service was authorized or available |
| Assignments/incidents and clinical workflows | NOT EXECUTED | Service-backed data unavailable |
| Patient Case, identity/history/notes, observations, medication, procedures | NOT EXECUTED | Service-backed data unavailable |
| Disposition, handover, signatures, PCR/finalization/audit | NOT EXECUTED | Service-backed data unavailable |
| Offline/restart/reconnect/outbox | NOT EXECUTED | Not directly demonstrated |
| Attachments/barcode/location/notifications/biometric | NOT EXECUTED | Not directly demonstrated |
| Vtiger/OpenEMR outage/recovery | BLOCKED | Requires service-backed acceptance |
| BLE/vendor monitor integration | NOT EXECUTED | Physical vendor gate; Stage 15 |

No patient, PHI, production credential, or production downstream data was used. No additional emulator was started.

## Remaining gates

Stage 14 is not complete. Remaining gates include complete repository/service-backed test recovery, Expo Doctor, the full synthetic-data emulator matrix, outage/recovery, prolonged offline/reboot/reconnect, revoked-device/security and clinical-safety review, physical-device/iOS/tablet usability, backup/DR, production signing, rollout/rollback, and support/training sign-off.

This report records observed evidence only and does not claim overall Stage 14 acceptance or release readiness.

## Continued execution addendum — 2026-09-17

### Git state

The current branch is `stage14/field-validation-release-readiness` at `693a0b3`
(`docs(stage14): record emulator acceptance evidence`). The LoginScreen fix, its
regression test, and the prior Stage 14 report are committed. `infra/.env.development`
was modified in the worktree and `infra/.env.development.bak` was untracked; both
protected files were left unstaged, unprinted, and unchanged. No push or merge was
performed.

### OpenEMR diagnosis and narrow correction

The failing service was `vems-openemr-dev`, exited during `/opt/vems/init-scripts/init-openemr.sh`.
The resolved Compose service configuration was valid and supplied the expected image,
mount, network, and environment keys; Compose interpolation was not the cause.

The exact committed defect was in `init-openemr.sh` lines 27–28: the SQL strings used
two backslashes before MySQL identifier backticks (`\\``). In `/bin/sh` double-quoted
strings this leaves an active command-substitution backtick, producing the observed
`openemr\\: not found` and MySQL `Unknown command '\\;'` errors. The correction reduces
each identifier delimiter to one shell escape (`\``), preserving literal SQL backticks.

The initializer is operationally idempotent for an existing schema: database creation
is `IF NOT EXISTS`, grants are repeatable, seed SQL is skipped when tables exist, and
the test-user template is applied without destructive statements. No shared container,
volume, database, or protected file was deleted or modified.

Regression and validation commands:

```text
sh -n infra/services/openemr/init-scripts/init-openemr.sh
bash -n infra/services/openemr/test/init-openemr.test.sh
infra/services/openemr/test/init-openemr.test.sh
docker compose -f infra/docker-compose.dev.yml --env-file infra/.env.development config --quiet
```

All passed. The regression captures generated MySQL commands with stub clients and
fails if the double-escaped delimiter remains.

The rebuilt image reached MySQL over Docker DNS and TCP, proving the delimiter fix was
executed. It then exposed an independent image/environment issue: the OpenEMR base
image's MariaDB client rejects the local MySQL self-signed certificate with
`TLS/SSL error: Certificate verification failure: The certificate is NOT trusted`.
No `--skip-ssl` change was introduced because that would weaken the local database
transport. OpenEMR HTTP/OAuth/API acceptance therefore remains **BLOCKED** pending
OpenEMR OAuth configuration, but the database TLS trust gate is addressed below.

### Individual orchestration failure diagnosis

The three previously failing suites were rerun serially with host loopback permission:

| Suite | Result | Classification | Evidence |
|---|---:|---|---|
| `services/orchestration/test/connectivity-validation.test.mjs` | PASS 3/3 | Environment/socket binding contention | All ping/challenge, rejected-token, and disabled-flag assertions passed |
| `services/orchestration/test/push-notifications.test.mjs` | PASS 20/20 | Environment/socket binding contention | Repository/token/assignment dispatch assertions passed |
| `services/orchestration/test/transports.test.mjs` | PASS 12/12 | Environment/socket binding contention | Auth, route, timeout, classification, and native OpenEMR transport assertions passed |

The earlier 40/43 result was caused by the restricted runner denying loopback test
server binds; it was not an OpenEMR product defect, configuration defect, test defect,
or timing issue. No timeout, assertion, or test was changed.

### Final local validation

| Check | Result |
|---|---|
| OpenEMR delimiter regression, shell syntax, Compose config | PASS |
| Complete orchestration suite | PASS — 263/263 |
| Complete API gateway suite | PASS — 128/128 |
| Mobile unit tests | PASS — 39/39 |
| Mobile component tests | PASS — 18 suites, 73/73 |
| Synthetic signed API login/readiness | PASS — HTTP 200 (prior evidence) |
| Smoke acceptance | PASS (prior evidence) |
| Vtiger connectivity | PASS (prior evidence) |
| OpenEMR adapter/service acceptance | BLOCKED — local MariaDB TLS trust failure |
| `git diff --check` | PASS |
| Android emulator | PASS — `emulator-5554` online, app installed, API reverse `3001` configured |

Because OpenEMR service acceptance is still blocked, no further service-backed Android
clinical workflow was claimed. Direct API evidence remains distinct from rendered UI
evidence; synthetic login was validated at the API/readiness layer only in this
continuation. Physical-device, iOS/tablet, real-crew, clinical-safety, outage/recovery,
backup/DR, production-signing, rollout/rollback, and support/training gates remain open.

## Explicit development CA continuation — 2026-09-17

The prior MySQL auto-generated server certificate had no SAN for the Compose
hostname `mysql`; the OpenEMR MariaDB client consequently failed with
`TLS/SSL error: Certificate verification failure: The certificate is NOT trusted`.
The development correction generates ignored material under `infra/.tls/mysql`,
configures MySQL with that server certificate, and mounts only the public `ca.pem`
into OpenEMR. The initializer uses `--ssl-ca` and `--ssl-verify-server-cert`.
The server certificate SAN includes `mysql`, `vems-mysql-dev`, `localhost`, and
`127.0.0.1`. Production TLS and hostname verification are unchanged.

Regression and live evidence:

```text
development-tls.test.sh                                      PASS
init-openemr.test.sh                                         PASS
openssl verify -CAfile ca.pem -verify_hostname mysql ...     OK
OpenEMR public-CA-only mysqladmin TLS ping                   ALIVE
OpenEMR initialization and HTTP service                      PASS; HTTP 302
OpenEMR readiness ping                                        PASS; HTTP 200
OpenEMR OAuth/API endpoint probes                            HTTP 500 (config gate)
Vtiger connectivity and adapter reachability                  PASS; HTTP 301
```

The HTTP 500 responses are an OpenEMR OAuth/API configuration gate, not a TLS
verification failure. No database or Docker volume was deleted.

The complete orchestration run was clean when serialized: 274 discovered, 263
passed, 0 failed, 11 skipped. The parallel run’s one retention failure was shared
SQLite/test-resource contention; the isolated retention test passed. API gateway
was 128/128; mobile unit tests were 214/214; mobile components were 18 suites,
73/73; smoke and `git diff --check` passed. The emulator rendered the login screen
with adb reverse on 3001 and 8081, but UI sign-in did not complete reliably and is
not claimed as a pass. Clinical, synchronization, offline/reconnect, and
outage/recovery workflows remain unexecuted pending OAuth/API configuration.

Uncommitted implementation files are `.gitignore`, `infra/docker-compose.dev.yml`,
the OpenEMR entrypoint/init scripts and focused tests, and the two development TLS/
startup scripts. Generated `infra/.tls/` is ignored. Proposed logical commits for
manual review: `fix(openemr): configure explicit development MySQL CA trust` and
`docs(stage14): record explicit OpenEMR trust acceptance`. No commit was created.
