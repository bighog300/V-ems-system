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

The current branch is `stage14/field-validation-release-readiness` at `0ce6268`
(`docs(stage14): record explicit OpenEMR trust acceptance`). The LoginScreen fix,
regression test, and MySQL/OpenEMR TLS work are committed. The current OAuth/API
provisioning corrections remain uncommitted for review. `infra/.env.development`
was already modified in the worktree and `infra/.env.development.bak` was untracked;
both protected files were left unstaged, unprinted, and unchanged. No push or merge
was performed.

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

The current uncommitted implementation files are `infra/docker-compose.dev.yml`,
`infra/services/openemr/Dockerfile`,
`infra/services/openemr/config/openemr.conf.php`, the OpenEMR entrypoint/init
scripts and focused tests, plus this report. The development TLS work is already
committed in `1c79f7b`, and the preceding report update is committed in `0ce6268`.
Proposed logical commit for the remaining files:
`fix(openemr): provision API-ready development site`. No commit was created during
this continuation.

## OpenEMR OAuth/API continuation — 2026-09-17

At `2026-09-17T13:02:53Z`, `GET http://127.0.0.1:8083/oauth2/default/token`
returned HTTP 500. The matching OpenEMR PHP log identified
`RuntimeException: sqlconf.php did not define $sqlconf array` at
`src/BC/DatabaseConnectionOptions.php:186`, reached from
`oauth2/authorize.php:26`. The repository Dockerfile copied a placeholder
`config/openemr.conf.php`, so OpenEMR had neither SQL configuration nor a
usable database connection. After that was corrected, the next proven gates
were: the upstream launcher skipped installation when `$config` was undefined;
then Apache could not read the installer-generated config because it was
root-owned mode 0400; after those fixes, the standard API was disabled until
the documented REST settings were enabled. These were all reproduced in
isolated disposable containers; existing data volumes were not deleted.

The final development provisioning is environment-backed and idempotent:
`$config = 0` activates the supported OpenEMR auto-installer, `sqlconf.php`
requires runtime DB variables without embedded credentials, the file starts
apache-owned/writable for installation, and the upstream launcher finalizes
permissions. Development-only `rest_api`, `rest_fhir_api`, and documented
password-grant settings are enabled through Compose; production defaults remain
unchanged. The public MySQL CA remains the only TLS material mounted into the
OpenEMR client.

Final isolated service evidence:

```text
OpenEMR schema provisioning                              PASS; 283 tables
OAuth discovery                                         PASS; HTTP 200
Documented synthetic client registration                 PASS
Password-grant token issuance                            PASS; HTTP 200
Authenticated standard OpenEMR API request               PASS; HTTP 200
Invalid OAuth credential rejection                       PASS; HTTP 400
Client-credentials assertion token                       PASS; HTTP 200
Invalid client assertion rejection                       PASS; HTTP 401
OpenEMR/Vtiger adapter connectivity                      PASS
```

The client-credentials `system` role remains restricted to FHIR routes by
OpenEMR; the VEMS standard REST adapter uses the documented user-role OAuth
flow and the exact required `user/patient.crus` scope. No OAuth bypass,
TLS-verification disablement, hard-coded credential, database deletion, or
volume deletion was used.

Final repository checks: orchestration `274 discovered / 263 passed / 0 failed /
11 skipped` serially; API gateway `128/128`; mobile unit `214/214`; mobile
components `18 suites, 73/73`; focused OpenEMR, shell, Compose, adapter, smoke,
Vtiger, and `git diff --check` checks passed. The emulator and adb reverse
channels remain available, but rendered UI sign-in/navigation was not captured
as a reliable PASS in this run. Synthetic clinical, synchronization,
offline/reconnect, and downstream outage/recovery workflows remain open.

## sqlconf.php permission security correction — 2026-09-17

The OpenEMR image Dockerfile previously installed the credential-bearing
`sites/default/sqlconf.php` as mode `0666`. The focused correction changes only
that image-layer mode to `0600` and retains `apache:apache` ownership. Upstream
`openemr.sh` runs `auto_configure.php` through `su-exec apache`, so owner read/write
is the minimum required during installation and Apache/PHP runtime. After setup,
the upstream finalizer executes `chmod 400 sites/default/sqlconf.php`; the
disposable runtime therefore reports `apache:apache 0400`.

The regression test now requires `0600` or `0660`, explicitly rejects a non-zero
world-write bit and the old `0666` line, and retains the no-hard-coded-password
checks. No credentials, keys, volumes, databases, or the shared port-8083
service were modified.

Focused validation evidence:

```text
docker build -t infra-openemr:stage14-installer infra/services/openemr       PASS
OpenEMR isolated schema initialization against retained 283-table schema       PASS
runtime sqlconf.php owner/mode: apache:apache 0400                           PASS
OAuth discovery                                                               PASS; HTTP 200
synthetic password-grant token                                                PASS; HTTP 200
authenticated OpenEMR API request                                             PASS; HTTP 200
invalid OAuth credentials                                                     PASS; HTTP 400
OpenEMR/Vtiger adapter connectivity                                           PASS
sqlconf/init/TLS shell regressions and shell syntax                           PASS
resolved development Compose configuration                                    PASS
orchestration                                                                PASS; 274 discovered, 263 passed, 0 failed, 11 skipped
API gateway                                                                  PASS; 128/128
mobile unit                                                                  PASS; 39/39
mobile components                                                            PASS; 18 suites, 73/73
smoke acceptance                                                             PASS
Vtiger connectivity                                                           PASS
git diff --check                                                             PASS
```

The first restricted-runner orchestration/API attempts were not product
failures: the runner denied loopback test-server binds and the API process was
not reachable from that context. Serial reruns with local loopback permission
passed without changing timeouts or assertions. Stage 14 remains incomplete;
rendered Android UI login/navigation and the directly observable synthetic
clinical, synchronization, offline/reconnect, and downstream outage/recovery
workflows remain open.

## Isolated runtime and emulator continuation — 2026-09-17

### Active topology

```text
VEMS API gateway       host port 3001 (temporary process overrides)
Isolated OpenEMR       vems-openemr-stage14-installer, host port 8085
Shared OpenEMR         host port 8083 — untouched
Vtiger                 host port 8080
Disposable OpenEMR DB  vems-mysql-stage14-openemr-test2, Docker port 3306
Shared MySQL           host port 3307 — untouched
Redis                  development instances on host ports 6380 and 6379
Metro                  Expo dev client, host port 8081
Android                emulator-5554, org.vems.mobilecrew installed
ADB reverse            host-19 tcp:3001 tcp:3001
                       host-19 tcp:8081 tcp:8081
```

The VEMS process used temporary environment overrides for
`OPENEMR_BASE_URL=http://127.0.0.1:8085`, standard OpenEMR API mode, and an
in-memory synthetic bearer token. No protected environment file or repository
endpoint was edited.

### Actual VEMS-to-isolated-OpenEMR evidence

```text
VEMS authenticated readiness       PASS; HTTP 200; OpenEMR status 200; Vtiger status 200
VEMS authenticated patient search  PASS; HTTP 200; synthetic no-match result
Direct OpenEMR discovery/token/API  PASS; 200/200/200
Invalid OpenEMR credentials         PASS; HTTP 400
OpenEMR/Vtiger adapter acceptance   PASS
Synthetic VEMS smoke workflow       PASS
```

The direct OpenEMR request and the VEMS patient-search request are separate
pieces of evidence; both succeeded after the gateway was run with the isolated
endpoint override.

### Rendered Android result

The emulator was online and the login screen rendered with controls for API
base URL, session token, crew ID, role, and the `Sign in` action. A submission
was performed using synthetic data. The first attempt using `127.0.0.1` showed
`fetch failed: unexpected end of stream`; the gateway saw no corresponding
request because the current ADB server's `host-19` reverse target did not reach
the Linux-side listener. A retry using the emulator host alias left the login
view but produced a blank post-submit hierarchy with no authenticated screen
marker and no usable first authenticated screen. UI login/navigation is
therefore **BLOCKED**, not a PASS. Temporary screenshots were kept outside the
repository; credentials and tokens were not recorded. Metro remained active and
the reverse mappings were preserved.

### Observable workflow matrix

| Workflow | Result | Evidence boundary |
|---|---|---|
| Assignment/incident retrieval in rendered UI | BLOCKED | UI did not reach authenticated screen |
| Multi-patient, known/provisional patient flows | NOT EXECUTED | No authenticated UI/session workflow |
| Patient Case, history, notes, observations | NOT EXECUTED | No direct service-backed end-to-end run |
| Medications, procedures, disposition, handover | NOT EXECUTED | No direct service-backed end-to-end run |
| Signatures, readiness, finalization/amendment | NOT EXECUTED | No authenticated UI workflow |
| Background/foreground and process restart | NOT EXECUTED | No authenticated UI state to preserve |
| Offline charting, durable outbox, replay/remapping | NOT EXECUTED | No authenticated UI workflow |
| Attachment synchronization | NOT EXECUTED | No authenticated UI workflow |
| Vtiger/OpenEMR outage and recovery | NOT EXECUTED | No destructive or shared-service outage test performed |

Automated synthetic coverage remains green for the corresponding API,
orchestration, mobile unit/component, smoke, adapter, and offline-support
tests, but those tests are not substituted for directly observed emulator
acceptance. Physical-device, iOS, production signing/store, security,
clinical-safety, DR, and vendor-device gates remain open.

## Session persistence and force-stop recovery — 2026-09-17

At `2026-09-17T18:04:44Z`, `emulator-5554` was online and
`org.vems.mobilecrew` was force-stopped and relaunched. The native
`MainActivity` returned to the foreground, but the hierarchy contained only
the native root `FrameLayout`; no React Native `app-lock-screen`,
`jobs-list-screen`, or `login-screen` rendered. Session readback and
authenticated navigation are therefore not claimed from this attempt.

The exact earlier reload failure was:

```text
Callback failure for call to http://10.0.2.2:8081/...
java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd
  at okhttp3.internal.http1.Http1ExchangeCodec$ChunkedSource.readChunkSize
  at com.facebook.react.devsupport.MultipartStreamReader.readAllParts
  at com.facebook.react.devsupport.BundleDownloader.processMultipartResponse
```

Windows `127.0.0.1:8081/status` resolves to the stale `E:\s14b` project,
while Windows `127.0.0.1:8082/status` resolves to the authoritative checkout.
The existing React Native dev menu now persists the supported value
`localhost:8081`, and the existing reverse rule remains `8081 -> 8082`.
However, reload still produced only the native root and no React Native
startup markers. `ReactHost` reported that its context was not ready; no fatal
JS/native exception was observed.

This is a development-client/Metro relay startup gate, not evidence of a
session, authentication, or product-data failure. Device-level SecureStore
readback across process restart is **BLOCKED / NOT OBSERVED**. The prior
rendered login PASS and authenticated-screen evidence remains valid for the
session active before force-stop. Sign-out/session removal could not be
exercised after restart because no JS screen rendered.

Automated mobile session tests remain PASS but do not replace device-level
readback evidence. No synthetic clinical records or downstream data were
created by this restart check; service-backed workflows requiring a rendered
authenticated screen remain **NOT EXECUTED**.

### Relay retest after Windows 8081 correction

At `2026-09-17T17:23:43Z` (WSL UTC command timestamp; Android log timestamps
are local emulator time), the application was force-stopped and relaunched
without clearing application data. `emulator-5554` remained online and both
reverse rules were retained:

```text
host-19 tcp:3001 tcp:13001
host-19 tcp:8081 tcp:8082
```

Windows `127.0.0.1:8081/status` and `127.0.0.1:8082/status` both returned
HTTP 200 with `packager-status:running` and the authoritative project root
`/home/bighog/repos/vems/V-ems-system/apps/mobile-crew`. Both
`AppEntry.bundle` responses returned HTTP 200 and 6,558,180 bytes.

The cold relaunch entered the React Native host lifecycle (`isMetroRunning()`
and `loadJSBundleFromMetro()`), proving the native host started, but no
ReactNativeJS startup marker or rendered hierarchy appeared. Logcat recorded
the precise transport failure at `2026-09-17T18:23:58.693Z`:

```text
Callback failure for call to http://10.0.2.2:8081/...
java.net.ProtocolException: Expected leading [0-9a-fA-F] character but was 0x2d
  at okhttp3.internal.http1.Http1ExchangeCodec$ChunkedSource.readChunkSize
  at com.facebook.react.devsupport.MultipartStreamReader.readAllParts
  at com.facebook.react.devsupport.BundleDownloader.processMultipartResponse
```

The dev-client field persisted `localhost:8081`, but its cold-start request
still used `10.0.2.2:8081`. The Windows relay is therefore HTTP-reachable and
serves the authoritative bundle to command-line clients, but its chunked/
multipart response is not accepted by the Android dev client. No app data,
SecureStore entries, Docker service, database, or volume was cleared or
modified. SecureStore session readback, authenticated navigation,
background/foreground recovery, and sign-out/relaunch removal remain
**BLOCKED / NOT OBSERVED**. Connected clinical workflows remain **NOT
EXECUTED** because the independent restart gate did not pass.

## Android token-authentication and API reverse-path diagnosis — 2026-09-17

### Token contract and verification

The repository-supported synthetic mechanism is the HS256 construction used by
`scripts/smoke-test.mjs`: JWT header `alg=HS256`, `typ=JWT`; claims include
`sub`, `role`, `iss`, `aud`, `iat`, and `exp`; the signature is an HMAC-SHA256
over the base64url header and payload. The active API process used
`JWT_ISSUER=local-dev`, `JWT_AUDIENCE=vems-platform`, and a process-local
synthetic HS256 secret. The minimum Stage 14 identity was `STAFF-001` with
role `field_crew`; no scope claim was required by the readiness endpoint.
`LoginScreen` calls `GET /api/support/readiness` with
`Authorization: Bearer <token>` and persists the resulting session only after
that request succeeds.

A fresh token was generated from the active process configuration and verified
against `http://127.0.0.1:3001/api/support/readiness` before UI use:

```text
length=232
sha256_prefix=e72f6a66ad20
issued_at=1789661907
expires_at=1789662207
claims=sub:STAFF-001,role:field_crew,iss:local-dev,aud:vems-platform,alg:HS256
HTTP=200
temporary_file=/tmp/vems-stage14-token, mode=0600, no trailing CR/LF
```

The token was copied through the Windows clipboard without printing its
content, and the temporary file was removed after the UI attempt.

### Controlled UI attempt

The Android form contained the exact URL `http://127.0.0.1:3001`, the pasted
token, `STAFF-001`, and `field_crew`; the Sign in control was enabled. The
token was confirmed unexpired with 207 seconds remaining immediately before
submission. At `2026-09-17T16:20:28Z`, logcat recorded only sanitized
`sign_in_failed` telemetry with `reason: network_error`. The hierarchy remained
on `login-screen`; no authenticated screen or session-navigation marker was
present. No fatal JavaScript or native error was recorded.

There was no VEMS API request log matching the submission timestamp. Earlier
API log entries from direct verification showed authenticated `STAFF-001`
readiness requests completing successfully, proving the token and verifier
configuration agree. The UI failure therefore occurs before API token
verification: the listed ADB mapping `host-19 tcp:3001 tcp:3001` does not expose
the WSL VEMS listener to emulator `127.0.0.1:3001` in the current namespace.
The configured mapping exists, but the transport is not connected to the
running API. This is an environment/relay blocker, not a token-authentication
or LoginScreen defect.

Android UI login remains **BLOCKED**. Session persistence/readback,
navigation, named authenticated-screen rendering, and all service-backed
clinical, synchronization, offline/reconnect, attachment, and outage/recovery
workflows remain unexecuted. No authentication policy, token verifier, or
protected environment file was changed.

## Android UI authentication PASS through Windows API relay — 2026-09-17

The established relay topology was used without changing its mappings:

```text
Windows 127.0.0.1:13001 -> WSL VEMS API 3001
emulator tcp:3001 -> host tcp:13001
emulator tcp:8081 -> host tcp:8082
Metro project root: /home/bighog/repos/vems/V-ems-system/apps/mobile-crew
```

A fresh synthetic HS256 token was generated from the active API process
configuration and verified through Windows relay port 13001. Metadata was
recorded as length 232, SHA-256 prefix `eff697c37b40`, subject `STAFF-001`,
role `field_crew`, issuer `local-dev`, audience `vems-platform`, issued at
epoch `1789663659`, and expired at epoch `1789663959`. It was copied via the
Windows clipboard from a mode-0600 temporary file and removed after use.

At `2026-09-17T16:51:37Z`, the rendered Android UI submitted the token using
`http://127.0.0.1:3001`. The VEMS API recorded authenticated
`GET /api/support/readiness` for `STAFF-001`/`field_crew` at
`16:51:37.898Z` and completed it successfully. Android emitted sanitized
`sign_in_succeeded` telemetry at `16:51:40.827Z`.

The post-login hierarchy visibly contained both `incident-workspace-screen`
and `jobs-list-screen`, plus the `sign-out` control. The captured screen showed
`STAFF-001 (field_crew)`, the authenticated workspace, sync controls, and the
assignment-detail placeholder. No fatal React Native, Android runtime, SQLite,
or native errors were present. This satisfies the Android UI login PASS
criteria, including API success, session persistence through successful
navigation, and a named authenticated screen.

The previously added development-only phase diagnostics were removed after the
successful reproduction; no production authentication behavior was changed.
Service-backed synthetic workflow continuation is now permitted. Unsupported
physical-device, iOS, production signing/store, security, clinical-safety, DR,
and vendor-device gates remain open.

### Post-login validation — 2026-09-17

The successful UI attempt was followed by service-backed automated validation:

```text
Mobile typecheck                         PASS
Mobile unit tests                        PASS; 39/39
Mobile component tests                   PASS; 73/73 across 18 suites
API gateway                              PASS; 128/128
Orchestration                            PASS; 263 passed, 0 failed, 11 skipped
Adapter connectivity                     PASS; isolated OpenEMR and Vtiger
Synthetic smoke                          PASS
Resolved development Compose config      PASS
git diff --check                         PASS
```

The authenticated UI screenshot and hierarchy from `16:51:37Z` remain the
direct emulator evidence: `incident-workspace-screen`, `jobs-list-screen`,
`sign-out`, `STAFF-001 (field_crew)`, sync controls, and the assignment-detail
placeholder were visibly rendered. The API logged the corresponding
authenticated readiness and assignment requests, and Android emitted
`sign_in_succeeded` without fatal JavaScript/native errors.

A later force-stop/relaunch check reached the native activity but did not
produce a stable JS accessibility hierarchy while Metro was reloading, so
cross-process SecureStore readback is recorded as **NOT independently
OBSERVED**. The login flow itself awaits `saveSession` before navigation, so
session persistence was part of the successful navigation path; this does not
substitute for a separate restart/readback observation.

Service-backed acceptance is now permitted for directly observable synthetic
workflows. Clinical workflow breadth, offline/reconnect replay, attachment
synchronization, downstream outage/recovery, and the unobserved restart
readback gate remain open or not executed. No shared OpenEMR data or protected
environment file was modified.

## Windows API loopback relay proof — 2026-09-17

The relay gate was tested before generating credentials:

```text
Windows 127.0.0.1:3001/health                 PASS; HTTP 200; {"status":"ok"}
ADB reverse listing                            PASS; host-19 tcp:3001 tcp:3001
Emulator emulator-5554                        PASS; device online
Emulator 127.0.0.1:3001 HTTP probe            FAIL; no response within 5 seconds
Matching VEMS API log                         FAIL; no request observed
```

The Windows portproxy table contains `127.0.0.1:3001 ->
172.22.103.130:3001`, and Windows owns a listener on port 3001. However, the
correlation-tagged emulator request at `2026-09-17T16:30:55Z` did not return an
HTTP response and did not appear in the VEMS API log. Refreshing the same ADB
reverse rule produced the same result. No token was generated, copied, or
submitted during this proof attempt.

The remaining Android gate is therefore **BLOCKED** by the ADB/Windows loopback
transport namespace. Token generation and UI acceptance must wait until an
emulator-originated request through `127.0.0.1:3001` is visibly correlated in
the VEMS API log.

## Focused Android UI login diagnosis — 2026-09-17

### Metro/source provenance

The initial port-8081 process was PID 49384 (`node .../expo start
--dev-client --clear --lan --port 8081`) with working directory
`/home/bighog/repos/vems/V-ems-system/apps/mobile-crew`. After the controlled
restart, Metro was again launched from that authoritative checkout with cache
clearing and LAN mode; `/status` returned `packager-status:running`.

The relevant source hashes (`verifySession.ts`, `RootNavigator.tsx`, and
`LoginScreen.tsx`) match between the authoritative checkout and `/mnt/e/s14b`.
`package.json` differs only in native launch scripts (`expo start` versus
`expo run:android`/`expo run:ios`), so `/mnt/e/s14b` remains a native build
workspace and was not used as the JavaScript acceptance source.

The decisive emulator probe was:

```text
GET /status through emulator 127.0.0.1:8081
HTTP 200; X-React-Native-Project-Root: E:\\s14b\\apps\\mobile-crew
packager-status:running
```

The same stale `E:\\s14b` project-root response was returned through
`10.0.2.2:8081` and `192.168.88.34:8081`. Therefore the ADB server's `host-19`
reverse endpoint is terminating at the Windows-side Metro, not the Linux Metro
started from the authoritative checkout. The Android dev menu initially also
showed persisted bundle location `10.0.2.2:8081`; the documented USB/reverse
value is `localhost:8081`. The emulator-side field was corrected to exactly
`localhost:8081`, but the active ADB server still resolved the stale Windows
endpoint.

### API configuration and login evidence

The mobile API base URL is entered at runtime in `LoginScreen.tsx`, passed to
`verifySession.ts`, and persisted in the session object; there is no bundled
`127.0.0.1`, `10.0.2.2`, or production endpoint. `verifySession` calls
`/api/support/readiness` with the entered bearer token. The host-side VEMS
runtime independently returned HTTP 200 for readiness and the authenticated
synthetic patient search against isolated OpenEMR.

Rendered UI submission evidence was captured after entering synthetic API URL,
session token, crew ID, and role. With the stale bundle/reverse path, the app
reported `fetch failed: java.io.IOException: unexpected end of stream` and
remained on LoginScreen. After the dev-client bundle-location correction, the
post-submit hierarchy became blank; it contained no authenticated screen,
`jobs-list-screen`, `Assigned jobs`, or `No active assignments` marker. The
mobile process remained alive, but logcat had no ReactNativeJS, AndroidRuntime,
Expo, SQLite, or unhandled-promise fatal entry. No VEMS request was observed
from the stale endpoint attempt. UI login is **BLOCKED** because the installed
dev client is not loading the authoritative Metro bundle through the current
ADB server; no authentication PASS or navigation PASS is claimed.

Metro also emitted a non-fatal local tooling warning that React Native DevTools
could not load because `libnspr4.so` is unavailable. Metro continued serving,
and this warning was not treated as the login root cause.

No repository code change was proven necessary in this diagnosis. Existing
mobile unit/component and LoginScreen regression coverage remains the applicable
regression guard. The remaining required action is to connect the emulator's
ADB server/reverse endpoint to the authoritative Linux Metro (or run the
native build's dev client from that same authoritative host) before repeating
UI acceptance. Service-backed clinical, synchronization, offline/reconnect,
attachment, and outage/recovery workflows remain NOT EXECUTED.
## Authoritative Metro relay and repeated Android login — 2026-09-17

### Relay and runtime evidence

```text
Metro relay PID 76396       cwd /home/bighog/repos/vems/V-ems-system/apps/mobile-crew
Metro relay                   port 8082; /status HTTP 200; packager-status:running
Metro project-root header     /home/bighog/repos/vems/V-ems-system/apps/mobile-crew
Emulator                      emulator-5554 device; org.vems.mobilecrew installed
ADB reverse                   host-19 tcp:3001 tcp:3001
                              host-19 tcp:8081 tcp:8082
```

The host-side `10.0.2.2:8082/status` probe returned HTTP 200 and the
authoritative Linux project-root header. The emulator-side raw probe to
`127.0.0.1:8081` did not return a response through the Windows relay namespace;
the configured reverse mapping is nevertheless recorded exactly as
`8081 -> 8082`. The dev-client bundle-location field remained
`localhost:8081`. The VEMS API was reachable from the emulator at the temporary
WSL address `http://172.22.103.130:3001`; `/health` returned HTTP 200. The
active API process was PID 71106 with temporary isolated-OpenEMR overrides;
non-secret settings were `JWT_ISSUER=local-dev`, `JWT_AUDIENCE=vems-platform`,
`AUTH_TRUST_HEADERS=false`, and `RBAC_ENFORCE=false`.

Using the active process-local synthetic secret without printing it, a direct
authenticated `/api/support/readiness` request returned HTTP 200. This is
direct API evidence only and is not UI evidence.

### UI attempts and evidence boundary

At `2026-09-17T15:38:34Z`, the rendered form was submitted with a temporary
base URL missing its scheme. The visible error was the deterministic Android
`MalformedURLException: no protocol` for the resulting readiness URL; no API
request was expected from that malformed request.

At `2026-09-17T15:46:40Z`, after entering
`http://172.22.103.130:3001`, the rendered form showed the deterministic
`invalid_credentials` error and remained on `LoginScreen`. A later controlled
submission at `2026-09-17T15:49:46Z` produced the same visible rejection.
The screen hierarchy contained `login-screen` and `login-error`, and no
`jobs-list-screen`, `Assigned jobs`, `No active assignments`, or `Sign out`
marker. Logcat showed only the sanitized `sign_in_failed` telemetry entry and
no fatal `ReactNativeJS`, `AndroidRuntime`, SQLite, or native exception. The
captured screenshot showed the login form and its error, not an authenticated
screen.

The process-local synthetic token was independently proven valid by direct
HTTP readiness, but the UI path did not produce a matching authenticated
navigation result. Therefore the required UI acceptance tuple—submit observed,
API success correlated to that submit, session persistence/readback,
navigation, named authenticated screen, and no fatal errors—is **BLOCKED**.
No service-backed clinical, synchronization, offline/reconnect, attachment, or
outage/recovery workflows were started because the authenticated-screen gate
was not met. Physical-device, iOS, production signing/store, security,
clinical-safety, DR, and vendor-device gates remain open.

## Direct authoritative Metro retest — 2026-09-17

The current WSL instance owns `172.22.103.130` on `eth0`; Metro PID 76396 is
listening on `*:8082`. From `emulator-5554`, a direct TCP probe to
`172.22.103.130:8082` returned exit code 0. The host-side direct `/status`
request returned HTTP 200 with `packager-status:running` and project root
`/home/bighog/repos/vems/V-ems-system/apps/mobile-crew`.

Repository `apps/mobile-crew/app.json`, available app config files, the native
manifest, and installed `dumpsys package org.vems.mobilecrew` were inspected.
The app defines no `scheme`; the installed package has only the launcher
`MAIN` intent and no development-client `VIEW`/`BROWSABLE` URL filter. No Expo
development-client scheme was guessed or used.

The existing dev-menu bundle-location control was used to target the direct
address `172.22.103.130:8082`, without changing application data or SecureStore
and without using Windows portproxy for the bundle. After reload, the native
activity remained foreground but the hierarchy contained only the native root
container. No ReactNativeJS startup or bundle-completion marker and no named
authenticated screen appeared. Direct Android HTTP tooling was unavailable,
but the TCP route was proven; the application-level direct bundle result did
not reach a rendered screen.

The API reverse mapping remains unchanged (`3001 -> 13001 -> WSL API`). No
session, database, Docker volume, protected environment file, or application
data was cleared or modified. Device-level session readback, restart
navigation, sign-out/relaunch removal, and connected clinical workflows remain
**BLOCKED / NOT OBSERVED** pending a stable JS bundle load.

## Expo development-client scheme correction — 2026-09-17

Expo SDK `57.0.20` was confirmed. The project initially had no
`expo-dev-client`; `npx expo install expo-dev-client` selected the SDK-compatible
`57.0.19`. The narrow configuration adds the product-specific lowercase
scheme `vems-mobilecrew` to `apps/mobile-crew/app.json` while preserving
Android application ID `org.vems.mobilecrew`.

Expo prebuild generated the Android VIEW/DEFAULT/BROWSABLE filter with both:

```text
vems-mobilecrew
exp+mobile-crew
```

The second value is Expo’s generated development-client scheme derived from
the slug and is the documented scheme for launching the custom client. The
direct WSL bundle link is therefore:

```text
exp+mobile-crew://expo-development-client/?url=http%3A%2F%2F172.22.103.130%3A8082
```

The generated-manifest regression passes and proves both schemes, VIEW/
BROWSABLE registration, and `org.vems.mobilecrew` application ID. Expo config
inspection reports `scheme=vems-mobilecrew`, `sdkVersion=57.0.0`, and the
expected Android package. Android export also passes.

Mobile TypeScript, unit (`214/214`), component (`73/73`), and config regression
checks pass. Expo Doctor reports one existing dependency-drift check failure
(Expo patch/minor drift and Jest major-version drift); no scheme/config error
was reported.

The synchronized Windows workspace contains only the required app config,
package metadata, lockfile, and validation script changes. Exact SHA-256
parity was proven for each changed file; no `.git`, secret, protected
environment, certificate, or runtime file was copied.

The Windows-native debug APK was not produced. JDK 25 builds failed in native
CMake with a restricted-method error; the available Gradle-managed JDK 17 was
then used, but the serialized build still emitted no APK artifact before
completion. Consequently no signing-certificate comparison or `adb install -r`
was attempted, and the installed package/data/SecureStore remain unchanged.
The deep-link emulator acceptance and subsequent connected workflow remain
**BLOCKED** pending a successful debug APK build and in-place upgrade.

## Android APK build diagnosis and retest — 2026-09-17

The complete controlled Gradle evidence is retained outside the repository in
the Windows workspace. The JDK 25 serialized logs are the Gradle daemon logs
`E:\EvidessaDev\android\gradle\daemon\9.3.1\daemon-25456.out.log`
(`arm64-v8a`) and `daemon-14948.out.log` (`x86_64`). Their first causal
failure was the Java 25 restricted-method warning during native CMake
configuration, in `:react-native-screens:configureCMakeDebug[arm64-v8a]`
and, for x86_64, `:expo-modules-core:configureCMakeDebug[x86_64]` and
`:react-native-screens:configureCMakeDebug[x86_64]`. The failed native command
was the toolchain CMake/Ninja configuration path; no application source or
JavaScript assertion caused these failures. JDK 25 was therefore not used for
acceptance.

The earlier JDK 17 retry did not fail or disappear: daemon
`E:\EvidessaDev\android\gradle\daemon\9.3.1\daemon-18560.out.log` records
`BUILD SUCCESSFUL in 7m 31s`. The later controlled JDK 17 build log is
`E:\s14b\stage14-jdk17-splash-build.log` and records
`BUILD SUCCESSFUL in 6m 44s`, with exit code 0. The successful build used
JDK `17.0.20.1` from
`E:\EvidessaDev\android\gradle\jdks\eclipse_adoptium-17-amd64-windows.2`,
Gradle `9.3.1`, Windows 11 amd64, working directory
`E:\s14b\apps\mobile-crew\android`, explicit
`-PreactNativeArchitectures=x86_64`, Android SDK
`E:\EvidessaDev\android\sdk`, CMake `3.22.1`, Ninja from that CMake
installation, and NDK `27.1.12297006`. React Native supplies AGP `8.12.0`,
Kotlin `2.1.20`, compile/target SDK `36`, and build tools `36.0.0`.
The project versions are Expo `57.0.20`, expo-dev-client `57.0.19`, and React
Native `0.86.3`. Gradle `--version` showed both launcher and daemon on JDK 17.

The native runtime failure after the first APK was built was deterministic:
the generated `MainApplication` loaded Expo dev-launcher, whose Android debug
implementation reflectively requires
`expo.modules.splashscreen.SplashScreenManager`. The app declared
`expo-dev-client` but not `expo-splash-screen`, so the class was absent from
the APK and logcat reported `ClassNotFoundException` at
`MainApplication.onCreate`. The narrow correction adds the SDK-compatible
`expo-splash-screen` dependency (`~57.0.8`, lockfile resolution 57.0.9).
No authentication, TLS, signing, or production configuration was weakened.

The corrected build produced:

| Field | Evidence |
|---|---|
| APK | `E:\s14b\apps\mobile-crew\android\app\build\outputs\apk\debug\app-debug.apk` |
| SHA-256 | `4538CE2D724B93A371728785F17958367074A7A27150995AF9A2B12030754A1F` |
| Application ID | `org.vems.mobilecrew` |
| Version | `1.0.0` / version code `1` |
| Signing certificate | Android debug certificate, SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Schemes | `vems-mobilecrew`, `exp+mobile-crew` |

The installed APK certificate matched the rebuilt APK exactly. `adb install -r`
returned `Success`; no uninstall, downgrade, package-data clear, or volume
operation was performed. `dumpsys package` continued to report data directory
`/data/user/0/org.vems.mobilecrew`, version `1.0.0`, and both schemes.

At `2026-09-17T19:31:47Z`, the exact documented deep link with
`CATEGORY_BROWSABLE` reached the app but Expo dev-launcher showed its error
activity with a deterministic upstream NPE at
`expo.modules.devlauncher.DevLauncherController.createAppIntent` line 448:
`Set.addAll(Collection)` was invoked on a null category set. This is launcher
intent handling, not an app authentication or bundle failure. Retrying the
same URI without adding an extra Android category allowed the app to reach
Metro: logcat records `isMetroRunning(): Async result = true`,
`loadJSBundleFromMetro()`, and `ReactNativeJS: Running "main"`. No
`ClassNotFoundException`, fatal native error, or JavaScript exception followed.
The dev-client then displayed its server/home UI and the app hierarchy showed
`bootstrap-loading` with a progress indicator; no named authenticated VEMS
screen was visibly rendered. The current UI gate is therefore **BLOCKED**:
native build and JS load pass, but authenticated session readback/navigation
after the deep-link launch is not directly observed. The app data and
SecureStore were preserved. No service-backed clinical, synchronization,
offline, attachment, or outage workflows were executed after this retest.

The earlier Expo Doctor dependency-drift result remains unchanged and was not
silently normalized: the repository has several Expo patch-level drifts and
Jest 30 versus the checker’s Jest 29 expectation. `npm ci --ignore-scripts`
completed successfully from the single root lockfile; the dependency
correction itself is the only additional package change.

Final automated evidence for this correction: mobile TypeScript PASS; mobile
unit PASS (39/39); mobile component PASS (73/73); config/manifest regression
PASS; orchestration PASS (263/263, 11 intentional skips); API gateway PASS
(128/128); smoke PASS; OpenEMR/Vtiger adapter connectivity PASS; Compose
configuration PASS; shell syntax PASS; and `git diff --check` PASS. The
authenticated Android UI and downstream clinical/offline/outage matrix remain
**BLOCKED / NOT EXECUTED** because the deep-link retest did not reach a named
authenticated screen.

## Post-bundle Android rendering diagnosis — 2026-09-17

The post-bundle capture was taken at `C:\\Users\\Public\\stage14-postbundle-current.png`; the complete hierarchy was pulled to `C:\\Users\\Public\\stage14-complete-ui.xml`. The visible surface was the VEMS React root in `org.vems.mobilecrew/.MainActivity`, not Expo Dev Launcher. The hierarchy contained the VEMS resource IDs `incident-workspace-screen`, `jobs-list-screen`, `sign-out`, `sync-now`, `jobs-error`, and `jobs-retry`, with visible synthetic-session text including `Assigned jobs`, `STAFF-001 (field_crew)`, `Sign out`, `Sync now`, and `Token expired`. The task contained only `MainActivity`; no DevLauncher activity was foreground.

The clean force-stop/deep-link launch began at `2026-09-17T18:44:49.3902559Z`. `adb shell am start -W` resolved the exact `exp+mobile-crew` VIEW intent to `.MainActivity`, returned `Status: ok`, `LaunchState: COLD`, and completed in 12.383 seconds. `.MainActivity` remained foreground at the 5-, 15-, and 30-second checks. Logcat was cleared before launch. This particular launch produced no new `Running main` or Metro bundle markers because the authoritative WSL Metro process had terminated and `http://172.22.103.130:8082/status` was unavailable; port 8082 was still occupied by the Windows relay (`svchost.exe`, PID 4204). The absence of a per-launch JavaScript marker is therefore a Metro-availability blocker, not evidence of an entry-registration failure.

An earlier direct launch while Metro was available recorded `isMetroRunning(): Async result = true`, `loadJSBundleFromMetro()`, and `ReactNativeJS: Running "main"`; subsequent hierarchy capture showed the VEMS React root described above. The app entry is consistent: `apps/mobile-crew/package.json` declares `main: index.ts`, `index.ts` calls Expo `registerRootComponent(App)`, Android `MainActivity` requests component `main`, and the root `App.tsx` returns `SafeAreaProvider` plus `RootNavigator`. No application splash-screen hold (`preventAutoHideAsync`, `hideAsync`, or unresolved splash promise) is present. Session restoration enters the authenticated branch; the preserved synthetic session was expired, which explains `Token expired` and is not a fresh-login result. SecureStore contents were not displayed or modified.

The `CATEGORY_BROWSABLE` deep-link NPE remains an upstream Expo dev-launcher defect at `DevLauncherController.createAppIntent` line 448 (`categories.addAll(...)` on a null category set). No generated manifest or upstream dependency was manually patched. No application code defect was proven, so no application fix or additional regression test was added in this diagnosis. A supported clean JavaScript reload with authoritative Metro active could not be completed while that process was unavailable.

Result: React root rendering is **PASS when Metro is available**; clean cold relaunch with timestamp-correlated bundle completion is **BLOCKED by Metro availability/relay port ownership**; fresh authenticated UI session persistence and named-screen acceptance are **NOT EXECUTED**. Connected clinical, synchronization, offline, attachment, and outage-recovery workflows remain **NOT EXECUTED**.

## Stage 14 post-reboot recovery — 2026-09-18

The recovery audit confirmed WSL `172.22.103.130`, the expected Stage 14
branch/HEAD, an online `emulator-5554`, and the existing Windows relays. The
protected `infra/.env.development` and `infra/.env.development.bak` files were
not modified or printed. No Docker volume, shared OpenEMR service/data on
8083, installed package, application data, or SecureStore contents were
cleared or recreated.

The retained topology was started without replacement containers or obsolete
retry/final/host experiments: `vems-mysql-stage14-openemr-test2` followed by
`vems-openemr-stage14-installer` on isolated network `vems-stage14-openemr-net`,
`vems-mysql-dev` followed by `vems-vtiger-ghcr-stage14` on `infra_vems-network`,
and the already-running `vems-redis-dev`. The retained MySQL data volumes were
attached unchanged. MySQL socket health passed for both databases; Redis
returned `PONG`; isolated OpenEMR HTTP returned `302`, OAuth discovery returned
`200`, OAuth password-grant issuance returned `200`, and an authenticated
standard API request returned `200`. Vtiger returned `301`, and the isolated
OpenEMR/Vtiger adapter connectivity check passed.

The temporary VEMS API ran on port `3001` with an isolated OpenEMR override and
returned `/health` `200`. Windows relay probes returned `200` for
`127.0.0.1:13001/health`, `127.0.0.1:8081/status`, and
`127.0.0.1:8082/status`. The 2222 SSH relay was not altered. Authoritative
Metro ran from `/home/bighog/repos/vems/V-ems-system/apps/mobile-crew` on
`0.0.0.0:8082` with a cleared cache; its status was `packager-status:running`
and `X-React-Native-Project-Root` identified that checkout. The non-fatal
React Native DevTools `libnspr4.so` warning did not prevent Metro startup.

ADB reverse mappings were recreated and emulator TCP probes passed:

```text
host-26 tcp:3001 tcp:13001
host-26 tcp:8081 tcp:8082
```

The exact development-client deep link cold-launched `.MainActivity` with
`Status: ok`, `LaunchState: COLD`, and Metro logcat evidence of
`isMetroRunning(): true`, `loadJSBundleFromMetro()`, and `Running "main"`.
The preserved session first rendered the authenticated jobs surface; an
explicit in-app sign-out returned to LoginScreen without clearing data. A new
five-minute synthetic `STAFF-001`/`field_crew` token was verified directly
against the API with HTTP `200`, copied to the Windows clipboard without
display, and removed after the UI attempt. The clipboard was then cleared.

The immediate Android UI submission remained **BLOCKED**: sanitized logcat
reported `sign_in_failed` with `invalid_credentials`, LoginScreen remained
visible, and no matching request reached the current API process. The direct
API and relay token checks passed, so this run does not claim authenticated UI
navigation, SecureStore readback, force-stop session persistence, sign-out
relaunch removal, or connected clinical/offline/outage acceptance. Temporary
API/Metro processes remain available for follow-up diagnosis; no token or
signing-secret file remains.

## Focused LoginScreen invalid_credentials diagnosis — 2026-09-18

The exact authentication path is `LoginScreen.handleSignIn` →
`verifySession` → `requestJson` → `buildRequestHeaders` →
`GET {trim(apiBaseUrl).replace(/\/$/, "")}/api/support/readiness` with the
header `Authorization: Bearer {trimmed authToken}`. `invalid_credentials` is
selected for any `UnauthorizedError`, including the pre-fetch
`buildRequestHeaders` branch that rejects an empty/whitespace-only token, and
for an HTTP 401 returned by `fetch`. `network_error` is selected for an
`ApiError` with `REQUEST_ABORTED` or for any non-`ApiError` exception. Other
HTTP failures become `unknown`.

The pre-submission Android hierarchy contained the exact API URL
`http://127.0.0.1:3001`. The token field was present, editable, secure
(`password=true`), and its content was never displayed. Metro status returned
`200` with `X-React-Native-Project-Root: /home/bighog/repos/vems/V-ems-system/apps/mobile-crew`.
The current bundle contained the committed LoginScreen and verifySession
markers, including the readiness path and authentication error strings. The
sole WSL listener for API port 3001 was the active API process; Windows PID
4288 remained the sole listener for relay port 13001.

The first controlled Android entry used `adb input text` and produced a
228-character secure-field value from the verified 232-character token. This
lossy input explains the prior `sign_in_failed: invalid_credentials`; it was
a client automation/input-path defect, not a VEMS API verifier failure.

For the one authorized retry, a five-minute token was directly verified with
HTTP `200`, stored temporarily with mode `0600`, copied to the Windows
clipboard, and length/hash metadata matched. Clipboard paste into the Android
secure field produced all 232 characters. At `2026-09-18T07:57:37Z`, the
submission emitted `sign_in_succeeded`; the API logged correlated
authenticated `GET /api/support/readiness` and `GET /api/assignments/mine`
requests at `07:57:38Z`/`07:57:39Z`, and the UI hierarchy showed
`jobs-list-screen`, `Assigned jobs`, and `Sign out`. No token, authorization
header, signing secret, or password was recorded. Temporary diagnostics,
token files, signing-secret files, and clipboard contents were removed.

No application correction was warranted. The temporary diagnostic logging was
removed completely. Mobile tests passed `214/214`, API gateway tests passed
`128/128`, and `git diff --check` passed. Session persistence/readback,
force-stop relaunch, sign-out relaunch, and the connected clinical matrix are
now unblocked for the next focused acceptance run.

## Session persistence and restart recovery — 2026-09-18

The preserved SecureStore session was checked without displaying its token.
After the prior token expired, the app still restored the authenticated shell
from SecureStore and rendered `jobs-list-screen`, `Assigned jobs`, and
`Sign out`; the correlated assignments request safely rendered `Token expired`.
This confirms expiry handling at the data-fetch boundary without changing
production token validation. The supported repository synthetic-token lifetime
is five minutes (`300` seconds).

A single fresh `STAFF-001`/`field_crew` token was generated after that expiry,
verified directly against `/api/support/readiness` with HTTP `200`, and copied
only through the Windows clipboard. The temporary file and clipboard had a
matching length of `232` bytes; the token content was never displayed. The
Android secure field was pasted from the clipboard, and the resulting
authenticated UI showed `jobs-list-screen`, `Assigned jobs`, and `Sign out`.

At `2026-09-18T08:12:24Z`, background/foreground returned to the same named
authenticated screen. The API correlated `GET /api/assignments/mine` at
`08:12:28Z` with actor `STAFF-001`/`field_crew`, `allowed: true`, and a
completed request. No token re-entry occurred.

The first valid force-stop/relaunch began at `2026-09-18T08:13:29Z` using the
authoritative development-client URI. The unscoped VIEW form resolved cold to
`org.vems.mobilecrew/.MainActivity`; Metro logged `isMetroRunning(): true`,
`loadJSBundleFromMetro()`, and React Native logged `Running "main"`. The
post-relaunch hierarchy showed `jobs-list-screen`, `Assigned jobs`, and
`Sign out`, with no LoginScreen. This is the SecureStore readback and direct
authenticated-navigation acceptance. A second same-token force-stop was not
claimed because the five-minute test lifetime had elapsed; no additional token
was generated.

Sign out returned immediately to `login-screen` with `Sign in` visible. A
force-stop followed by another authoritative deep-link cold launch, without
clearing package data, again completed the Metro bundle and `Running "main"`,
then showed `login-screen` with no jobs-list, `Assigned jobs`, or `Sign out`.
This verifies persisted-session removal and relaunch behavior.

No source changes or temporary diagnostics were retained. The connected
synthetic clinical matrix was not started: the repository-supported five-minute
token lifetime is not suitable for the longer workflow after the restart and
sign-out gates, and authentication policy was not weakened. Temporary token and
JWT-secret files were removed and the Windows clipboard was verified at zero
bytes. Protected environment files, Docker volumes, shared OpenEMR on 8083,
application data, and SecureStore were preserved. Remaining gates are the
connected clinical/offline/attachment/outage matrix under a supported longer
test credential, if one is provided by the development/test environment.

## Connected synthetic clinical workflow — Section A — 2026-09-18

Section A authentication was executed with one fresh five-minute synthetic
`STAFF-001`/`field_crew` token. The token was directly verified with HTTP 200,
copied through the Windows clipboard with matching `232`-byte file/clipboard
lengths, pasted into the secure Android field, and never printed. The temporary
token and JWT secret files were removed immediately afterward and the clipboard
was verified empty.

The rendered Android UI showed `jobs-list-screen`, `Assigned jobs`, and
`Sign out`. The API correlated the UI submission at `2026-09-18T08:19:29Z`
with authenticated `GET /api/support/readiness`, followed by
`GET /api/assignments/mine` at `08:19:30Z` for `STAFF-001`/`field_crew`; RBAC
evaluation allowed the request and both requests completed successfully.

The assignment surface then visibly showed `No active assignments right now`.
No assignment card, incident identifier, or incident detail was rendered, so
opening a synthetic assignment and proving `incident-workspace-screen` access
was **NOT EXECUTED / BLOCKED** by the absence of retained synthetic assignment
data. No real patient data was displayed. API-only evidence was not promoted
to a UI PASS, and Section B was not started.

The remaining connected sections (multi-patient cases, clinical record,
disposition/handover, finalization safeguards, and downstream OpenEMR/Vtiger
record correlation) remain **NOT EXECUTED** pending a retained or explicitly
provisioned isolated synthetic assignment. Offline and outage-recovery gates
also remain open. No application source, environment file, Docker volume,
shared OpenEMR data, or installed application data was modified.

## Synthetic assignment fixture and Section A repeat — 2026-09-18

The repository-supported fixture path was used exclusively: authenticated
public API mutations with `Idempotency-Key` headers, followed by the existing
orchestration sync-worker path. No direct database writes were used. The
isolated topology was verified as the retained `vems-vtiger-ghcr-stage14`
container on host port `8080`, the isolated OpenEMR on host port `8085`, and
the API process database at the retained `services/api-gateway/.data` path.
Shared OpenEMR port `8083` was not accessed or modified.

The unique synthetic fixture key was `STAGE14-20260918-SECTION-A`. Public API
provisioning created exactly these synthetic records:

- vehicle `AMB-914`, callsign `STAGE14-A`, synthetic station/type metadata;
- personnel `STAFF-001`, display name `SYNTHETIC STAFF-001`, role `field_crew`;
- incident `INC-000001`, low-priority medical-emergency category, synthetic
  location `STAGE14-SYNTHETIC-LOCATION`, patient count `0`;
- assignment `ASN-000001`, vehicle `AMB-914`, crew `STAFF-001`.

The assignment was transitioned through the supported
`confirm_assignment` API action to `Assigned`. Exact idempotent replay returned
the same incident ID, and public API counts showed exactly one matching vehicle,
personnel record, incident, and assignment. No duplicate was created. The
fixture is intentionally retained for later Sections B–E. No destructive
cleanup was performed; reconciliation is by the recorded fixture key and the
same public API idempotency/replay paths after downstream readiness is restored.

The isolated Vtiger webservice authenticated successfully for `HelpDesk`, but
the retained Vtiger image does not expose the required `VEMSAssignments`,
`VEMSVehicles`, or `VEMSPersonnel` custom modules. The sync worker consequently
dead-lettered the incident, vehicle, and personnel mirror intents with
`VTIGER_PROTOCOL_ERROR`/non-JSON responses; the assignment mirror remained
blocked by its missing incident linkage. This is a retained-image/schema gate,
not a credential or API-fixture duplication issue. No Vtiger schema or image was
modified.

Section A was repeated with one fresh five-minute synthetic
`STAFF-001`/`field_crew` token. Direct readiness verification returned HTTP
`200`; the 232-byte token was transferred only through the Windows clipboard,
then the temporary token file and clipboard were cleared immediately after
sign-in. The Android hierarchy visibly showed `job-ASN-000001`, incident
`INC-000001`, and status `Assigned`. Opening that card visibly rendered
`incident-workspace-screen`, with `INC-000001` and `ASN-000001` both present.
The API correlated `/api/assignments/mine` with exactly one matching active
assignment and correlated the workspace’s
`GET /api/incidents/INC-000001/patient-cases` request for `STAFF-001`.

Section A UI/API assignment access is **PASS**. Full Section A downstream
Vtiger correlation is **BLOCKED** by the missing custom modules. Sections B–E
remain **NOT EXECUTED** until the isolated Vtiger image is provisioned with
the repository-required modules or an approved equivalent retained fixture
environment is supplied. No real patient data was displayed.

## Connected synthetic clinical workflow — Section B — 2026-09-18

Section B used the retained synthetic fixture `INC-000001` / `ASN-000001` and
one fresh five-minute `STAFF-001`/`field_crew` session. Authentication used a
directly verified token transferred only through the Windows clipboard; the
token file was removed and the clipboard cleared immediately after sign-in.
No JWT, credential, or authorization header was recorded.

The Android UI visibly listed `job-ASN-000001` and opened
`incident-workspace-screen` for `INC-000001` / `ASN-000001`. The Patient cases
card initially showed no cases. The rendered `New patient case` control then
created two distinct records under the same incident:

- `PCR-000001`, synthetic known-case label `Stage_Alpha`; the rendered
  Patient Case detail and Patient Identity screens were reached, and the
  synthetic demographics were saved with the visible `demographics-saved`
  marker. API evidence recorded successful `POST /api/incidents/INC-000001/
  patient-cases` and `PUT /api/patient-cases/PCR-000001/demographics`.
- `PCR-000002`, synthetic provisional-case label `Unknown_Beta`; the rendered
  Patient Identity screen exposed the documented `Mark as unidentified`
  control. Its request reached `POST /api/patient-cases/PCR-000002/
  provisional-patient`, but the isolated OpenEMR adapter returned HTTP 404
  while creating the downstream patient. The UI retained the identity error
  state and did not report a successful provisional link.

The rendered incident list visibly showed both `PCR-000001` and `PCR-000002`,
proving distinct Patient Case identifiers and no immediate overwrite. The
known case demographics save and the provisional action were correlated to
the active VEMS API process. No OpenEMR patient/encounter linkage was claimed:
the known case did not complete the OpenEMR identity-link step, and the
provisional path failed at the isolated adapter’s HTTP 404 endpoint. The
retained Vtiger image blocker remains unchanged: `VEMSAssignments`,
`VEMSVehicles`, and `VEMSPersonnel` are absent and the image/schema was not
modified.

Section B is **BLOCKED / PARTIAL**. Patient Case creation and distinct-case
rendering passed; complete known-patient OpenEMR linkage, provisional/unknown
linkage, multi-case switching with a distinguishing clinical entry,
downstream duplication/idempotency proof, and all Sections C–E were not
executed. The workflow stopped before observations, medications, or
procedures. The isolated OpenEMR adapter’s HTTP 404 must be corrected in the
retained test environment before resuming; no API-only substitution or
destructive cleanup was performed. Protected environment files, Docker
volumes, shared OpenEMR port `8083`, and Android application data were
preserved.

## Section B blocker diagnosis — 2026-09-18

The retained database was inspected read-only. Both cases remain attached to
`INC-000001` and `ASN-000001`, with status `Patient Identification Pending`:

- `PCR-000001` / `Stage_Alpha`: demographics are present (`Stage`, `Alpha`,
  synthetic DOB `2000-01-02`, sex `X`), with no patient link or encounter.
- `PCR-000002` / `Unknown_Beta`: no demographics, no patient link, no
  encounter, and one durable `patient_case_provisional_requests` reservation
  with status `pending`, created at `2026-09-18T08:43:39.704Z`.

The provisional UI request was received by VEMS at
`2026-09-18T08:43:39.701Z` and used `POST
/api/patient-cases/PCR-000002/provisional-patient`. The sanitized downstream
request was `POST http://127.0.0.1:8085/api/v1/patients`; VEMS classified the
response as downstream HTTP 404 and returned an unhandled downstream failure.
The retained OpenEMR access log independently recorded the same request at
`08:43:39 UTC` with HTTP 404 and no credential material. A non-authenticated
route comparison confirmed `POST /api/v1/patients -> 404`, while the retained
standard route `POST /apis/default/api/patient -> 401` (authentication gate),
proving the request reached OpenEMR and that the failure was not TCP
connectivity, TLS, or an absent patient resource.

Root cause: the temporary Stage 14 API process was started with
`OPENEMR_BASE_URL=http://127.0.0.1:8085` but without
`OPENEMR_API_STYLE=standard`, so the transport selected its legacy
`/api/v1/*` routes. The repository’s supported standard transport constructs
`/apis/default/api/patient` and preserves OAuth authentication and TLS
verification. No OpenEMR core file, image, schema, protected environment file,
volume, or shared port-8083 service was changed.

The original provisional idempotency header value was not persisted in the
sanitized log, and the provisional operation currently uses its durable
case-scoped reservation rather than replaying that header. Blind retry of the
retained `pending` reservation is therefore intentionally rejected as
“pending or outcome unknown”; the retained PCR-000002 was not retried or
altered. A narrow correction now treats only a proven downstream HTTP 404 from
the patient-create operation as a retryable `failed` reservation. It leaves
unknown outcomes `pending`, permits a later case-scoped retry after the
standard route is restored, and never creates another Patient Case. Regression
coverage proves the retry links the same case and produces exactly one case.

The API harness diagnosis was independent. The initial 0/22 result was caused
by the restricted runner denying test servers’ loopback bind with
`listen EPERM: operation not permitted 127.0.0.1`; it was not port 3001
occupation, inherited Stage 14 overrides, fixture/bootstrap failure, or an
assertion defect. Running serially with loopback permission passed the patient
case file, and the complete suites passed `128/128` API tests and `264/264`
executed orchestration tests (275 discovered, 11 non-test/skipped entries).

The repository smoke command was also attempted. It reached the API health
endpoint but stopped at the first protected master-data request with HTTP 401
because no UI/backend token was generated during diagnosis. This is recorded
as **NOT EXECUTED**, not treated as a product failure.

## Section B recovery continuation — 2026-09-18

The retained isolated OpenEMR services remained running and the temporary VEMS
API was restarted on host port `3001` with process-only overrides:

```text
OPENEMR_BASE_URL=http://127.0.0.1:8085
OPENEMR_TOKEN_URL=http://127.0.0.1:8085/oauth2/default/token
OPENEMR_API_STYLE=standard
OPENEMR_SITE=default
OPENEMR_GRANT_TYPE=password
```

Protected environment files were not edited. The retained OpenEMR OAuth client
table did not contain the repository placeholder `local-dev-client`; its
password-grant request therefore correctly returned `401 invalid_client`. The
supported OpenEMR `openemr-dev:register-api-test-client --site=default` command
registered one synthetic isolated test client. Generated credentials were kept
only in a mode-0600 temporary file, used in process memory, and removed. This
changed isolated OAuth test configuration only; no schema, patient record,
volume, shared OpenEMR service, or application data was changed.

Backend adapter gates after that registration:

```text
OAuth password grant, isolated OpenEMR                         PASS; HTTP 200
Standard patient route /apis/default/api/patient              PASS; HTTP 200
Invalid OAuth credential rejection                             PASS; HTTP 401
Repository standard OpenEMR transport patient search          PASS; synthetic no-match
VEMS/Vtiger/OpenEMR adapter connectivity                        PASS
Synthetic VEMS smoke                                           PASS
```

The repository had no supported reconciliation action for an already-pending
provisional reservation. A narrow privileged API action was added:
`POST /api/patient-cases/{id}/provisional-patient-reconciliation`, requiring
the explicit proven outcome `downstream_not_created` and `downstream_status`
`404`. It marks only the existing reservation `failed`, audits the transition,
and never creates a Patient Case or native OpenEMR resource. The existing
provisional create path then retries the same case and remains idempotent.
Focused orchestration coverage passes `16/16`.

The recovery action was not invoked against the retained fixture because the
restarted API's documented `VEMS_DB_PATH=.data/platform.development.sqlite`
contains no `PCR-000001` or `PCR-000002`; authenticated API queries returned
an empty case list for `INC-000001` and `404` for both case IDs. A read-only
scan of retained SQLite files found no durable provisional reservation for
`PCR-000002`. Recreating a case or manually mutating a row was not attempted.
Consequently no OpenEMR patient/encounter link was created, no duplicate check
could be claimed, and no Android token/session was generated or used in this
continuation.

Validation:

```text
API gateway                                                   PASS; 128/128
Orchestration                                                 PASS; 265/265
Focused provisional reconciliation                            PASS; 16/16
Mobile unit                                                   PASS; 214/214
Mobile components                                             PASS; 18 suites, 73/73
Authenticated smoke                                           PASS
git diff --check                                              PASS
```

Changed files in this continuation are `services/orchestration/src/patient-cases.mjs`,
`services/orchestration/test/patient-cases.test.mjs`,
`services/api-gateway/src/server.mjs`,
`services/api-gateway/src/authorization-policy.mjs`,
`docs/PATIENT_CASES.md`, and this report. Protected environment files remain
preserved and were not intentionally edited during this continuation.

Section B remains **BLOCKED** at retained VEMS database handoff. The required
next gate is to restore or point the temporary API at the existing retained
Stage 14 VEMS database containing `INC-000001`, `PCR-000001`, `PCR-000002`,
and its pending reservation, without creating a replacement case. The missing
Vtiger custom modules remain a separate downstream deployment blocker. No
Section C work was performed.

Changed files in this diagnosis:

- `services/orchestration/src/patient-cases.mjs` — narrow 404 reservation
  classification and safe same-case retry.
- `services/orchestration/test/patient-cases.test.mjs` — exact provisional
  404 and retry regression.
- this report.

PCR-000002 remains **BLOCKED pending supported API restart with
`OPENEMR_API_STYLE=standard` and a controlled UI retry**. No UI token was
generated. Section B remains paused before clinical record entry; no
observations, medications, procedures, or destructive reconciliation were
performed.

## Retained VEMS database handoff investigation — 2026-09-18

`SqliteClient` resolves `VEMS_DB_PATH` with `path.resolve()` relative to the
Node process cwd. The supported `scripts/start-api.sh` changes to the
repository root and runs `npm run start -w @vems/api-gateway`; npm runs that
workspace script with `services/api-gateway` as its package cwd. With no
explicit database path, the original API therefore used:

```text
/home/bighog/repos/vems/V-ems-system/services/api-gateway/.data/platform.sqlite
```

The restarted process was launched directly from the repository root after
sourcing `env/development.env`, resolving `.data/platform.development.sqlite`
to:

```text
/home/bighog/repos/vems/V-ems-system/.data/platform.development.sqlite
```

That root development database is valid but does not contain the Stage 14
fixture. No migration or replacement data was run against it.

Read-only inventory of relevant repository candidates:

```text
path                                                        size   mode  mtime                  sha256 prefix   exact synthetic identifiers
.data/platform.development.sqlite                           409600 0644  2026-09-06 13:59:27  7d519acc4e5a  INC 1, ASN 1; no PCRs
.data/platform.sqlite                                       319488 0644  2026-09-06 10:15:04  e6a7b167b81d  none
services/api-gateway/.data/platform.development.sqlite      266240 0644  2026-09-06 08:43:42  c07520452dff  INC 1, ASN 1; no PCRs
services/api-gateway/.data/platform.sqlite                   708608 0644  2026-09-18 09:35:03  2f066e86a352  full coherent fixture
services/orchestration/.data/platform.development.sqlite    319488 0644  2026-09-06 09:12:31  efeab38e257c  none
services/orchestration/.data/platform.sqlite                4096   0644  2026-09-18 08:25:06  f1c1d714b195  none
.aider.tags.cache.v4/cache.db                               356352 0644  2026-09-06 07:18:43  5e1cf620e930  none
```

All candidates had WAL/SHM companions and read-only `PRAGMA integrity_check`
returned `ok`. No SQLite candidates were found under `/tmp` paths named
`vems-stage14*` or under `/mnt/e/s14b`. Application candidates contained the
expected migration/table families; the authoritative candidate has 22 applied
migrations through `022_clinical_observations_device_pairing`. The cache DB
contains only `Cache` and `Settings`.

The authoritative candidate contains the coherent retained fixture:

```text
INC-000001                         New
ASN-000001 / AMB-914               Assigned
PCR-000001 / Stage_Alpha           Patient Identification Pending
PCR-000002 / Unknown_Beta          Patient Identification Pending
PCR-000002 reservation             pending, exactly one row
patient links/encounters           none
```

The base database SHA-256 and mtime were unchanged across API startup:
`2f066e86a3523940a0eac2520de4a233a21ee1c44e8b0679f539712fe81be87f` and
`2026-09-18 09:35:03.268814313 +0100`. Integrity remained `ok`, the migration
count remained 22, and no separate Node writer was present before handoff. The
API process currently holds the retained database and WAL/SHM descriptors; no
authenticated mutating request was sent.

The temporary API was restarted with the explicit absolute retained path and
standard isolated OpenEMR overrides. `/health` returned HTTP 200. An
unauthenticated incident request returned HTTP 401 as expected; the synthetic
incident/case list was verified through the read-only database queries above.
No Android launch or token issuance occurred.

### Reconciliation endpoint security audit

The recovery action is authorized only for `supervisor` and `sys_admin`;
`field_crew` and `dispatcher` receive HTTP 403. It is case-scoped through the
requested PCR ID and first loads that exact case and its durable reservation.
No tenant abstraction exists in the current schema, so cross-tenant behavior
is not applicable; no arbitrary row/table operation is exposed. It accepts only
the explicit proven outcome `downstream_not_created` with downstream HTTP 404.
Other or unknown outcomes remain pending. Proven failure transitions the
existing reservation to `failed`; the existing provisional create action then
reuses the same Patient Case and cannot allocate PCR-000003. Repeated
reconciliation is state-idempotent and produces one audit event. Focused
authorization, audit, idempotency and retry tests pass `18/18`.

Changed files in this handoff investigation:
`services/orchestration/src/patient-cases.mjs`,
`services/orchestration/test/patient-cases.test.mjs`,
`services/api-gateway/src/server.mjs`,
`services/api-gateway/src/authorization-policy.mjs`,
`services/api-gateway/test/patient-cases.test.mjs`,
`docs/PATIENT_CASES.md`, and this report. No SQLite file, Docker volume,
protected environment file, Android application data, or shared OpenEMR data
was modified.

## Section B recovery resumed — 2026-09-18

The recovered API runtime used the explicit absolute database path
`/home/bighog/repos/vems/V-ems-system/services/api-gateway/.data/platform.sqlite`
with `OPENEMR_API_STYLE=standard`, isolated OpenEMR on port 8085, and API port
3001. The retained database integrity check remained `ok`; the fixture counts
were one each for `INC-000001`, `ASN-000001`, `PCR-000001`, and `PCR-000002`,
with zero `PCR-000003` rows. The retained database was not edited directly.

The original PCR-000002 reservation was reconciled once through the privileged,
case-scoped endpoint, then retried once through the supported existing-case
provisional link action. The response referenced `PCR-000002`; the reservation
transitioned to `completed`; and the same case received one provisional
OpenEMR patient link, `a2c6406b-c7a5-4b61-b99c-99141a3d0f11`. No encounter link
was created, which is expected before the later encounter/clinical workflow.
Read-only duplicate checks found one VEMS patient link, one matching isolated
OpenEMR patient, zero encounter links at this milestone, and zero PCR-000003
rows. Audit evidence contains exactly one `reconcile_provisional_failure` and
one `link_patient` event for PCR-000002. PCR-000001 remained `Stage_Alpha`,
unchanged, and both cases remained linked to `INC-000001`.

Android Section B evidence: a fresh clipboard-pasted STAFF-001/field_crew
session successfully rendered `Assigned jobs`, `ASN-000001`, `INC-000001`, and
the incident workspace. The workspace visibly rendered both
`PCR-000001 / Stage_Alpha / Patient Identification Pending` and
`PCR-000002 / Unknown_Beta / Patient Linked`. The PCR-000002 detail visibly
showed the provisional OpenEMR link above; switching back visibly rendered the
independent PCR-000001 identity state. The token file was removed immediately
after sign-in and the Windows clipboard was verified empty. No JWT was entered
with adb input text.

The current Section B UI provides identity and read-only patient-history cards,
but no supported harmless note/history editor. Per the test rule, cross-case
entry isolation is **NOT EXECUTED** rather than being substituted with an
API-only write. No clinical observations, medications, procedures, encounter,
or handover records were created; execution stops before Section C.

### Revalidation

- API gateway: **PASS**, 129/129 tests (the added reconciliation security test
  makes the current total 129 rather than the earlier 128).
- Orchestration: **PASS**, 265 passing, 0 failing (276 discovered including
  skipped/non-pass entries).
- Mobile unit: **PASS**, 214/214.
- Mobile component: **PASS**, 73/73.
- OpenEMR/Vtiger adapter connectivity: **PASS** for the retained isolated
  endpoints.
- Retained database integrity: **PASS**, `PRAGMA integrity_check=ok`.
- `git diff --check`: **PASS**.
- Authenticated smoke was not rerun because the retained authoritative database
  must not receive a new incident/assignment/patient-case fixture during this
  recovery; prior authenticated smoke evidence remains recorded separately.

Section B recovery status: **PASS for reconciliation, downstream linkage,
case rendering, and case switching; NOT EXECUTED for UI entry-isolation proof**.
The separate retained Vtiger custom-module deployment blocker remains open.
Changed implementation files remain `services/orchestration/src/patient-cases.mjs`,
`services/orchestration/test/patient-cases.test.mjs`,
`services/api-gateway/src/server.mjs`,
`services/api-gateway/src/authorization-policy.mjs`,
`services/api-gateway/test/patient-cases.test.mjs`, and `docs/PATIENT_CASES.md`;
the report is the documentation change. No commit was created.

## Section C1 attempt — 2026-09-18

C1 was started only. A fresh clipboard-only STAFF-001/field_crew session
authenticated successfully and visibly reopened `ASN-000001`, `INC-000001`,
and `PCR-000001 / Stage_Alpha`. The PCR-000001 detail screen exposed the
supported identity and encounter controls, but PCR-000001 has no OpenEMR
patient link in the recovered database, so the UI correctly displayed
`Identify the patient (verified or unidentified) before starting an encounter`
and did not expose `Start encounter`.

The rendered identity search was exercised with the existing synthetic
`Stage_Alpha` values. The request reached VEMS as `POST /api/patients/search`,
but the temporary API's isolated OpenEMR OAuth client was rejected with HTTP
401 `invalid_client`. No patient create, patient link, encounter, assessment,
or other clinical write was submitted. Independent re-registration of the
supported isolated test client reproduced the same OAuth client rejection, so
this is an isolated OAuth fixture/runtime blocker requiring repair before C1
can continue. No shared OpenEMR port-8083 data, Docker volume, SQLite row,
Android application data, or SecureStore data was modified.

Section C1 status: **BLOCKED before encounter creation**. No observations,
medications, procedures, disposition, handover, signature, or finalization
work was started. The temporary token and credential files were removed and
the Windows clipboard was verified empty. No JWT was entered with adb input
text. This report is the only additional file changed in this attempt; no
commit was created.

## Section C1 OAuth repair and identity retry — 2026-09-18

The isolated OpenEMR OAuth client was reprovisioned through the supported
`openemr-dev:register-api-test-client --site=default` CLI, running as the
OpenEMR `apache` user. The active client registry match was enabled in site
`default`, client ID length 43, with safe fingerprint prefix `9733abf45bba`.
Credentials were held only in mode-0600 temporary files/process environment and
were removed after API startup; no credential value was recorded.

The required password-grant parameters were confirmed as `grant_type=password`
and `user_role=users`. The repaired API process uses the explicit retained
database path `/home/bighog/repos/vems/V-ems-system/services/api-gateway/.data/platform.sqlite`,
`OPENEMR_API_STYLE=standard`, isolated OpenEMR
`http://127.0.0.1:8085`, token endpoint
`/oauth2/default/token`, site `default`, and port 3001. One listener owns port
3001. The initial post-repair OAuth request without the OpenEMR username/password
surfaced `invalid_grant`; restarting with the complete password-grant runtime
configuration resolved the adapter failure.

Readiness evidence: OpenEMR discovery HTTP 200; direct token issuance HTTP 200;
intentional synthetic invalid-client rejection HTTP 401 with `invalid_client`;
standard patient route unauthenticated HTTP 401; adapter connectivity PASS;
VEMS authenticated patient search HTTP 200 with zero exact synthetic matches.
PCR-000001 remained `Patient Identification Pending` with no VEMS or isolated
OpenEMR patient link. PCR-000002 retained its separate provisional link
`a2c6406b-c7a5-4b61-b99c-99141a3d0f11`. Read-only isolated OpenEMR lookup found
zero exact `Stage_Alpha` patients before creation.

A fresh clipboard-pasted STAFF-001/field_crew session rendered the retained
assignment, incident workspace, and PCR-000001 identity controls. The emulator
then moved to Android Settings during explicit non-token identity-form input;
the form submission could not be completed reliably. No patient create/link,
encounter, assessment, or other clinical write was issued. Isolated OpenEMR
exact synthetic patient count remained zero. The API, database, Docker
volumes, shared OpenEMR 8083, Android application data, SecureStore, and
protected environment files were preserved.

Section C1 status: **BLOCKED at rendered identity submission after OAuth repair**.
Encounter and assessment persistence remain unexecuted; C2 observations,
medications, procedures, disposition, handover, signatures, and finalization
remain unstarted. The retained Vtiger custom-module deployment blocker remains
separate and unchanged. No commit was created.

### C1 repair validation

- Focused API patient-case/identity tests: **PASS**, 10/10.
- Focused orchestration patient-case tests: **PASS**, 16/16.
- Full API gateway suite: **PASS**, 129/129.
- Full orchestration suite: **PASS**, 265 passing, 0 failing (276 discovered).
- Mobile TypeScript: **PASS**.
- Mobile unit suite: **PASS**.
- Mobile component suite: **PASS**, 73/73.
- `git diff --check`: **PASS**.
- No authenticated smoke mutation was run against the retained authoritative
  fixture database; adapter/OAuth readiness was directly verified instead.

## C1 manual Create and link correlation — 2026-09-18

The single manual tap was observed after the five-minute STAFF-001 session had
expired. The Android hierarchy showed `identity-error: Token expired`; the
identity screen remained rendered with the synthetic Stage/Alpha search values,
the no-match result, and the Create and link control. No patient identity or
link success marker was rendered.

The active VEMS API process remained the sole listener on port 3001
(`node src/server.mjs`, PID 51815). Its last correlated identity request was
the earlier `POST /api/patients/search` at 2026-09-18T10:26:13Z, completed
successfully after the isolated OpenEMR search at 10:26:14Z. No patient-create,
patient-link, or subsequent identity request was logged for the manual tap.

The isolated OpenEMR container likewise showed no request in the manual-tap
window. Its only matching recent activity was the earlier OAuth token HTTP 200
and standard patient search HTTP 200 for the zero-match check. Isolated MySQL
reported no matching error activity. Therefore the expired-session rejection
occurred client-side before fetch; no VEMS or OpenEMR mutation occurred, no
Stage_Alpha patient was created, and PCR-000001 remains unlinked.

Section C1 status remains **BLOCKED before rendered identity submission**.
Encounter and assessment persistence remain unexecuted. No source code or
protected environment file changed; this correlation and the prior recovery
entries are documentation only. No commit was created.

## C1 fresh-token manual submission retry — 2026-09-18

The API, isolated OpenEMR OAuth discovery, authoritative Metro, emulator, and
Windows relay listeners were healthy before the retry. A fresh supported
STAFF-001/field_crew JWT was directly verified with HTTP 200 and transferred
through the Windows clipboard with an exact length match of 232 characters;
the token content was not recorded.

The rendered identity form showed the synthetic Stage/Alpha/2000-01-02/X
values and `No matching patients found`. Android logcat was cleared at
2026-09-18T10:44:16Z. The single user tap was observed at approximately
2026-09-18T10:45:19Z; the UI displayed `Token expired` before submission.

API correlation showed no patient-create or patient-link POST after the
cutoff. The only later API traffic was read-only PCR-000001 state inspection:
the patient link remained HTTP 404 and PCR-000001 remained
`verification_status=unknown`. Isolated OpenEMR and MySQL logs showed no
patient request or write in the correlation window. No Stage_Alpha patient was
created and no PCR-000001 link exists.

The temporary token file was removed and the Windows clipboard was cleared.
Section C1 remains **BLOCKED before rendered identity submission**; encounter,
assessment, and all later clinical sections remain unexecuted. No source code,
protected environment file, SQLite row, Docker volume, Android application
data, SecureStore data, or shared OpenEMR data was modified. No commit was
created.

## C1 uninterrupted-window retry — 2026-09-18

Prerequisite health checks passed for the VEMS API, isolated OpenEMR OAuth
discovery, authoritative Metro, Windows relay listeners, and emulator. A
continuous sanitized capture was started for Android logcat, VEMS API output,
isolated OpenEMR, and isolated MySQL before token issuance. The emulator was
already positioned on the PCR-000001 identity form with the synthetic
Stage/Alpha/2000-01-02/X values.

A fresh supported token was issued as the final preparation step, directly
verified HTTP 200, copied through the Windows clipboard with exact length 232,
and configured to expire at 2026-09-18T10:53:23Z. After the user completed the
sequence and tapped Create and link once, the rendered UI showed
`identity-error: Token expired` and remained on the identity form. The
captured Android evidence contains no patient-create or patient-link request;
the API and isolated OpenEMR/MySQL captures contain no write activity.

Authenticated readback after the tap confirmed PCR-000001 HTTP 200 with
`verification_status=unknown`, patient-link HTTP 404, and unchanged synthetic
Stage/Alpha demographics. No Stage_Alpha OpenEMR patient was created. The
prepared token was therefore not demonstrably active in the app at submission
time, despite the fresh-token preparation; no automatic retry was performed.

The temporary token file and Windows clipboard were cleared, and only the
temporary capture processes were stopped. Section C1 remains **BLOCKED before
rendered identity submission**. Encounter and assessment persistence remain
unexecuted. No source, protected environment file, SQLite row, Docker volume,
Android application data, SecureStore data, or shared OpenEMR data was
modified. No commit was created.

## C1 token-expiry diagnosis — 2026-09-18

No further token was issued. Simultaneous clock evidence showed Windows and
emulator epoch `1789728733` at the capture point, with WSL epoch `1789728736`
three seconds later. The API is a WSL host process (PID 51815), not a separate
time-skewed container, and therefore shares the WSL clock. Windows timezone was
`GMT Standard Time`; WSL reported `BST`; the emulator reported
`Europe/London`. These timezone labels do not affect epoch comparisons. The
emulator boot time was `2026-09-17 20:52:24`; automatic time and automatic
timezone were both enabled (`1`). No manual time change was made.

Source tracing proves the message is not generated by a client-side expiry
check. `LoginScreen` calls `verifySession`, then stores only the API URL, raw
auth token, actor ID, actor role, and device ID. `Session` has no `expires_at`
field; `loadSession` performs no JWT decode or expiry comparison. The identity
screen calls `createPatient`, which calls `requestJson`, which performs
`fetch` before any error is constructed. HTTP 401 responses are converted to
`UnauthorizedError` using the server response message, so the displayed
`Token expired` text is the VEMS auth error propagated by the client.

The API validates `exp` using `Math.floor(Date.now() / 1000)` and rejects the
request before its routed `request_received` logging. This explains why an
expired bearer can produce no `/api/patients` route entry while still being
rejected at the VEMS listener. It is not evidence that the client skipped
fetch. The exact source path is `services/api-gateway/src/auth.mjs` claim
validation, followed by `apps/mobile-crew/src/api/httpClient.ts` 401
normalization and `apps/mobile-crew/src/screens/PatientIdentityScreen.tsx`
error rendering.

SecureStore remains present and untouched (`SecureStore.xml`, 1,727 bytes,
mode `0660`, safe hash prefix/full hash retained only in local evidence). Its
encrypted contents were not read or printed. No plaintext token, decoded
`iat`/`exp`, or stored `expires_at` could be safely recovered from the app
without exposing protected session material; the source inspection establishes
that no separate expiry metadata exists. The evidence therefore classifies the
issue as **server-side bearer rejection: the active app session was not proven
to contain the freshly issued token at create time, or the token had genuinely
expired before validation**, not clock skew or a seconds/milliseconds client
conversion defect.

No correction is justified by the evidence. Token lifetime and validation were
not changed; app data, SecureStore, Docker volumes, protected files, and shared
OpenEMR were preserved. C1 remains **BLOCKED pending a fresh sign-in whose
active session token can be correlated at the create request**. No commit was
created.

## C1 temporary ADB/UIAutomator harness attempt — 2026-09-18

Repository tooling audit found no supported Maestro, Detox, Appium, Espresso, or
UIAutomator driver. A temporary Node/ADB harness was built outside the
repository and passed its unauthenticated dry run: hierarchy parsing, resource
ID lookup, calculated-bounds tapping, safe non-secret text replacement,
screenshot/evidence capture, and disabled-submit verification all passed. The
harness was removed after the attempt.

The pre-token health gate passed for VEMS `/health` HTTP 200, isolated OpenEMR
OAuth discovery HTTP 200, authoritative Metro `/status` HTTP 200, Windows
relay listeners 13001 and 8081, retained containers, and emulator-5554. The
sanitized Android, OpenEMR, and MySQL captures were started before token
issuance. A supported 232-character STAFF-001/field_crew token was directly
verified against the running API with HTTP 200 and copied to the Windows
clipboard with matching length and safe SHA-256 prefix. No token content was
recorded.

The single automated run stopped at the Sign in state assertion. The harness
checked the immediate hierarchy after tapping Sign in instead of waiting for
the asynchronous authenticated transition; the recorded hierarchy was still
`login-screen`. The token's recorded `iat` was 2026-09-18T11:32:57Z and its
five-minute expiry was 2026-09-18T11:37:57Z, while the captured sign-in
interaction began at approximately 11:42Z. This attempt is therefore
classified as **BLOCKED by genuine token expiry before authenticated UI
transition**, with a secondary harness timing defect. The harness never
invoked Create and link. No patient-create, patient-link, OpenEMR patient, or
PCR-000001 mutation occurred.

The temporary authentication diagnostics recorded only one accepted direct
readiness request for the safe fingerprint prefix `afe55f3da7c8`, length 232,
with 291 seconds remaining at 11:33:06Z; no patient submission request was
recorded. Temporary diagnostics, token/credential files, and clipboard content
were removed. The temporary API process was stopped. Protected environment
files, authoritative SQLite, Docker volumes, Android data, SecureStore, and
shared OpenEMR 8083 were preserved.

Section C1 remains **BLOCKED before rendered identity submission**. No source
behavior correction was retained. Exact repository files changed in this run:
`docs/STAGE14_EXECUTION_REPORT_2026-09-17.md` only; the existing protected
`infra/.env.development` modification and untracked
`infra/.env.development.bak` were preserved unchanged. No commit was created.

## C1 deterministic asynchronous harness attempt — 2026-09-18

A temporary Python standard-library ADB/UIAutomator driver was built and
removed outside the repository. It implemented fresh hierarchy and foreground
polling, bounded waits, timeout evidence, calculated-bounds taps, verified
non-secret text replacement, clipboard/KEYCODE_PASTE support for secrets,
single-tap mutation protection, and timestamped screenshots/hierarchies.

The no-token dry run passed in **79.0 seconds**. It verified LoginScreen
control discovery and safe non-secret entry. The estimated complete path was
within the 240-second budget, so one bounded authenticated attempt was
authorized.

The pre-token gate passed: authoritative SQLite path was pinned, API health was
HTTP 200, isolated OpenEMR OAuth discovery was HTTP 200, Metro status was HTTP
200, Windows relays were listening, emulator-5554 was online, captures were
active, LoginScreen was present, and no stale token file or clipboard content
remained. A temporary isolated OAuth client was provisioned through the
supported OpenEMR CLI; credentials were captured only in mode-0600 temporary
files and removed afterward. The temporary API used the absolute retained
database path, `OPENEMR_API_STYLE=standard`, isolated OpenEMR port 8085, and
port 3001.

The single fresh supported token was directly verified HTTP 200, with length
232 and safe fingerprint prefix `16ab483d3ae8`, and copied to Windows with an
exact length/hash match. The harness stopped before token paste: after the
deep-link wait reported `login-screen`, the next fresh hierarchy was the Expo
DevLauncher `Tools` overlay and no API URL field was present. The timeout
evidence is retained under `/tmp/stage14-android-evidence-v2`. The harness
therefore classified the attempt as **BLOCKED before authentication** and did
not invoke Create and link. API capture contained only the direct readiness
request; no assignments, patient search, patient-create, patient-link, or
OpenEMR/MySQL write activity occurred.

The token file, signer secret, OAuth credentials, temporary harness, and
clipboard content were removed. API and service captures were stopped. No
repository source behavior changed; no Patient Case, OpenEMR record, Docker
volume, Android application data, SecureStore data, or shared OpenEMR 8083
data changed. The harness is not proposed for repository retention until the
DevLauncher overlay stabilization is repaired. Section C1 remains **BLOCKED**.

## C1 reusable Expo DevLauncher-resilient driver — 2026-09-18

The observed `Tools` marker was reproduced and captured at
`/tmp/stage14-overlay.xml` and `/tmp/stage14-overlay.png`. The foreground
activity remained `org.vems.mobilecrew/.MainActivity`. The screenshot showed a
floating DevLauncher tools button over the VEMS LoginScreen, not a modal
overlay; therefore pressing Back in that state exits to the Android launcher.
The prior apparent overlay race also produced a Tools-only hierarchy, which is
handled separately.

Added repository files:

- `scripts/stage14/android-ui-driver.py`
- `scripts/stage14/test_android_ui_driver.py`

The driver classifies VEMS screens, true Tools-only and launcher states,
Android Settings, and unknown states using explicit hierarchy markers. It
recovers true Tools-only state with exactly one Back, recovers launcher state
through the documented deep link, and never treats the floating Tools button as
an overlay when a VEMS screen marker is present. A watchdog runs before every
UI action. The stable-login gate requires ten continuous seconds of VEMS
LoginScreen markers, MainActivity foreground, required controls, and Metro
status before authentication preparation. JWTs use clipboard/KEYCODE_PASTE
only; the single Create and link mutation is guarded against repeat taps and
requires at least 60 seconds of token lifetime.

Validation:

- Focused Python harness tests: **PASS**, 6/6.
- Repository harness dry run with launcher recovery, floating-Tools
  classification, stable-login gate, hierarchy-derived controls, and safe
  non-secret fields: **PASS**.
- `git diff --check`: **PASS**.

No token was generated or pasted during this driver-repair run. No patient,
OpenEMR, SQLite, Docker-volume, Android-data, SecureStore, or shared OpenEMR
8083 mutation occurred. No commit was created.

## C1 autonomous authenticated harness attempt — 2026-09-18

Preflight passed for the explicit authoritative database path,
`OPENEMR_API_STYLE=standard`, one temporary API listener on port 3001, Metro,
emulator-5554, Windows relays, existing ADB reverse rules, retained fixture
state, harness tests 6/6, and the repository dry run. The isolated OAuth
client was provisioned through the supported CLI using mode-0600 temporary
storage. After correcting temporary CLI-output parsing, isolated OAuth issued
HTTP 200 and the standard patient route returned HTTP 200 for the synthetic
Stage/Alpha no-match search using the required `api:oemr user/patient.rs`
scope. No protected environment file was edited.

The one supported STAFF-001/field_crew token was issued at
`2026-09-18T13:01:11Z`, with five-minute expiry at `13:06:11Z`, length 232 and
safe SHA-256 prefix `0adf3810ecf9`. Direct VEMS readiness verification was
HTTP 200 and Windows clipboard length/hash verification passed. The harness
reached stable LoginScreen, pasted through KEYCODE_PASTE, and attempted the
single Sign in tap. The secure paste left the Android IME visible over the
lower form; although `submit-sign-in` was present in the hierarchy, the tap
did not produce the expected transition or any API request. The bounded wait
expired with the final evidence hierarchy still on `login-screen`; the token
had approximately 203 seconds remaining at abort. No automatic retry occurred.

Harness transition summary: stable LoginScreen PASS; secure paste PASS;
Sign in action attempted once; jobs-list-screen NOT REACHED; assignment,
incident, PCR-000001, identity search, Create and link, patient-create, and
patient-link NOT EXECUTED. VEMS API capture contained only the direct
readiness request. Isolated OpenEMR and MySQL captures contained no patient or
write activity. Patient count and PCR-000001 link count remained unchanged;
PCR-000002 was not touched.

The token, signer, OAuth credential files, clipboard, API process, and capture
processes were removed/stopped. A narrow harness correction was retained:
`dismiss_keyboard()` now sends one Back after secure paste and waits for the
Sign in control before tapping. No authenticated retry was performed. Focused
harness tests remain 6/6 PASS and `git diff --check` passes.

C1 result: **BLOCKED before authentication**. Exact files changed in this
run: `scripts/stage14/android-ui-driver.py` and this report; the existing
protected `infra/.env.development` modification and untracked backup were
preserved. No commit was created.

## C1 keyboard hardening and bounded rehearsal — 2026-09-18

`dismiss_keyboard()` was hardened to distinguish a rendered IME window from
Android's stale `mInputShown=true` state. A visible IME now requires an
on-screen, non-zero surface; the observed `surface=[0,0][0,0]` state is treated
as hidden. The method preserves the focused value, refuses application-state
navigation, refreshes the hierarchy, and verifies an enabled Sign in control.
The no-token rehearsal also requests the supported IME show action before
testing dismissal.

Focused harness tests: **PASS**, 9/9, including stale zero-surface rejection
and rendered-surface acceptance. The rehearsal reached the preserved VEMS
LoginScreen and entered only harmless temporary API text. The emulator did not
present a rendered software IME within the five-second bound, even after the
supported `ime show` request; the rehearsal stopped before authentication and
before any mutation. No JWT was generated, no API request was made, and no
patient/OpenEMR/database/Android-data mutation occurred.

The current run is **BLOCKED before token generation** by the emulator IME
presentation state. The ADB transport was intermittently unavailable while
collecting post-failure evidence; no application data or system settings were
reset. `git diff --check` passed. Changed files in this run are
`scripts/stage14/android-ui-driver.py`,
`scripts/stage14/test_android_ui_driver.py`, and this report. No commit was
created.

## C1 keyboard-mode-agnostic harness and ADB gate — 2026-09-18

The driver now treats the software IME as optional. A rendered non-zero IME is
dismissed through the IME service; an absent or stale zero-sized IME is a
no-op. Submit visibility is checked independently through fresh hierarchy
queries, bounded scrolling, enabled-state verification, and obstruction
checks. Read-only ADB operations have two bounded transient retries; tap,
swipe, and keyevent operations are never retried.

Focused harness tests: **PASS**, 13/13. The ADB server was restarted and the
emulator reported `device` with `sys.boot_completed=1`; three individual
hierarchy dumps succeeded and reverse mappings were recreated for emulator
3001→Windows 13001 and emulator 8081→Windows 8082. The required 60-second
stability gate then failed because repeated shell probes returned
`WSL UtilBindVsockAnyPort: socket failed`. The no-token rehearsal was not
started after that failed gate, and no JWT, authentication, API request, or
clinical mutation occurred.

Section C1 remains **BLOCKED before token generation** pending a stable Windows
ADB/WSL transport. No emulator reboot or wipe was performed. Changed files are
`scripts/stage14/android-ui-driver.py`,
`scripts/stage14/test_android_ui_driver.py`, and this report. No commit was
created.

## C1 native Windows harness handoff — 2026-09-18

The native Windows ADB executable at
`E:\EvidessaDev\android\sdk\platform-tools\adb.exe` was started directly
from Windows PowerShell. `emulator-5554` reported `device` and
`sys.boot_completed=1`. The 60-second native gate passed with ten consecutive
shell commands, ten hierarchy dumps, foreground checks, and screenshots. The
native reverse mappings were recreated and verified for emulator 3001 to
Windows 13001 and emulator 8081 to Windows 8082. No WSL ADB invocation was
used during that gate.

The driver now accepts `--adb`, `--device`, `--evidence-dir`, `--api-url`, and
`--development-client-url`; subprocesses remain argument-array based and the
Linux/WSL defaults remain available. Local focused tests and `git diff --check`
pass. Windows discovery found no `py.exe`; `python.exe` is only the Microsoft
Store execution alias and cannot run Python. Per the execution constraint, no
Python installation was attempted, the Windows mirror was not run, and the
native no-token dry run could not be started. No token, authentication, API
request, or clinical mutation occurred.

Section C1 remains **BLOCKED before token generation** pending review and
provision of an approved native Windows Python runtime. No emulator reboot or
wipe was performed. No commit was created.

## C1 native Windows Node driver — 2026-09-18

Native Windows Node was found at `C:\Program Files\nodejs\node.exe`, version
24.19.0, with npm 11.17.0. Added dependency-free repository files
`scripts/stage14/android-ui-driver.mjs` and
`scripts/stage14/android-ui-driver.test.mjs`. The Node driver accepts explicit
ADB/device/evidence/API/development-client arguments, uses clipboard-only JWT
input with protected length/expiry metadata, preserves the no-retry mutation
guard, and keeps token content out of arguments and logs. The Python driver was
retained.

The Windows mirror at `E:\s14b\stage14-harness` matched both repository files
by SHA-256. Native Windows Node tests passed **13/13**. The native no-token dry
run passed, including launcher recovery, stable LoginScreen, API URL
restoration, keyboard-agnostic handling, and Sign in visibility. No token was
generated during the dry run.

One bounded authenticated run was then performed. A fresh supported synthetic
token was directly verified HTTP 200 and copied to the Windows clipboard at
exact length 232. The native driver pasted the expected-length value and tapped
Sign in exactly once. The UI remained on LoginScreen; no readiness, assignment,
patient-search, patient-create, or patient-link request reached the active API.
No clinical or OpenEMR mutation occurred. The failure is classified as
**BLOCKED before authentication**, pending investigation of native clipboard
paste/sign-in behavior; it was not retried. Windows clipboard, token,
metadata, temporary signing secret, OAuth client files, and runtime processes
were cleaned up. No Docker volumes or application data were changed.

Repository Node tests and `git diff --check` pass. No commit was created.

## C1 native Sign-in activation diagnosis — 2026-09-18

The failed native run was classified as **keyboard obstruction with stale IME
state**, not a raw ADB dispatch failure. The preserved pre-sign-in hierarchy
showed `submit-sign-in` enabled and clickable at
`[608,1109][1952,1221]`, giving the exact derived tap `(1280,1165)`. The
foreground remained `org.vems.mobilecrew/.MainActivity`; no launcher, Settings,
or DevLauncher interception was present. The screenshot showed the software
keyboard covering the lower form and the Sign in control. The secure field had
the expected-length paste and remained focused; no VEMS request followed the
single tap.

The Node driver was corrected to use non-zero visible `ImeInsetsSourceProvider`
state, treat stale `mInputShown`/zero surfaces as absent, and scroll the
LoginScreen above a real IME inset without unsafe Back navigation. A benign
nonzero `ime hide` result is tolerated. Focused Node tests now pass **14/14**;
native Windows Node tests pass **14/14** and the native no-token dry run passes.

Appium/UiAutomator2 was **not installed**: raw ADB click dispatch was not
proven to be the cause, and the obstruction was corrected at the harness layer.
No JWT was generated, no Sign-in request or clinical mutation occurred in this
diagnostic run. Exact repository changes are
`scripts/stage14/android-ui-driver.mjs`,
`scripts/stage14/android-ui-driver.test.mjs`, and this report. No commit was
created.

## C1 autonomous native Node run — 2026-09-18

Preflight passed: retained isolated containers were up; OpenEMR discovery was
HTTP 200; the standard OAuth password grant with `user_role=users` was HTTP 200;
the exact synthetic Stage/Alpha search was HTTP 200 with zero matches; the
native Windows ADB 60-second gate passed with reverse mappings; native Node
tests passed **14/14**; and the native no-token dry run passed.

One supported 300-second synthetic STAFF-001/field_crew token was directly
verified HTTP 200 and copied to the Windows clipboard at exact length 232 with
matching safe SHA-256 prefix. The native Windows Node harness pasted the
expected-length value and preserved LoginScreen. It detected the authoritative
IME as obstructing Sign in, attempted the bounded IME hide path, and captured
the obstruction/scroll evidence. The sign-in control was never tapped because
it remained obscured; no readiness, assignment, patient-search, patient-create,
or patient-link request reached the API. No mutation occurred.

C1 result: **BLOCKED before authentication**. The run was not retried. The
remaining issue is that this emulator's IME remains rendered after the hide
request and the LoginScreen scroll container did not move Sign in above the
reported obstruction. Appium was not installed or used. Token, clipboard,
metadata, signing secret, OAuth files, API/Metro sessions, and temporary log
captures were cleaned up. Docker volumes, Android application data, SecureStore,
and shared OpenEMR data were preserved. No commit was created.
## C1 guarded real-IME dismissal — 2026-09-18

The native Node harness was hardened with guarded real-IME dismissal. A Back
event is sent exactly once only when the authoritative non-zero
`ImeInsetsSourceProvider` state, VEMS `MainActivity`, `vems_login`, and focused
field preconditions all hold. Absent or stale/zero-sized IME state sends no key
event. Postconditions require the IME to be absent, the same VEMS LoginScreen
and focused field to remain present, the safe field length to remain unchanged,
and enabled Sign in to be visible.

The Node suite passes 24/24 locally and natively on Windows. The native
no-token rehearsal reached the real IME path, sent the one guarded Back, and
then observed the foreground change to the Android launcher. The harness
aborted before Sign in; it did not retry Back, did not authenticate, and did
not mutate VEMS or OpenEMR. Therefore the final authenticated C1 run was not
issued a token and remains BLOCKED at the pre-auth IME-dismissal gate.

The persistent VEMS Tools accessibility icon was also distinguished from the
actual DevLauncher Tools overlay; the classifier regression is covered by the
suite. The Windows 8082 relay remained healthy and identified the authoritative
WSL checkout. No protected environment file, app data, SecureStore, Docker
volume, or database was modified.
## C1 Escape-only IME attempt — 2026-09-18

The native Windows Node harness now provides `dismissRealImeWithEscape()`.
It requires the VEMS MainActivity/LoginScreen, focused session-token field,
authoritative non-zero IME inset, no sign-in tap, and no armed mutation. It
sends Android `KEYCODE_ESCAPE` (`111`) exactly once, with no Back fallback and
no key-event retry. Postconditions require the same VEMS activity and
LoginScreen, preserved token length, absent IME, and visible/enabled Sign in.

Validation passed: native Node behavioral suite 30/30, Python compatibility
suite 13/13, Windows mirror SHA-256 parity, native Windows Node suite 30/30,
and `git diff --check`.

The no-token rehearsal passed completely. A harmless clipboard value was
entered, the real IME was dismissed with one Escape, LoginScreen remained
foreground, Sign in became visible/enabled, and all harmless values were
cleared. No JWT or Sign-in request was used during rehearsal.

Final authenticated preflight passed: retained isolated services, one API
listener on port 3001, absolute retained database
`services/api-gateway/.data/platform.sqlite`, standard isolated OpenEMR OAuth,
zero Stage_Alpha matches, Metro `/status`, Windows relays, emulator, and ADB
reverse mappings. One supported 300-second JWT was directly verified and
transferred through the Windows clipboard with safe length/fingerprint checks.

The single actual native authenticated attempt reached the Escape path but
timed out because the authoritative IME remained visible after Escape. The
harness stopped before Sign-in; no assignment, patient search, patient-create,
patient-link, or OpenEMR write request followed. The only API request observed
for this attempt was the direct readiness verification. No mutation retry was
performed. Token, OAuth credential, access-token response, clipboard, and
transient sensitive captures were cleaned. C1 identity linking remains
**BLOCKED at IME dismissal**; no claim of Stage 14 completion is made.

Changed repository files in this attempt:

- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report
## C1 static-header IME focus-transfer attempt — 2026-09-18

The harness was changed to use one guarded tap on the current non-interactive
`V-EMS Crew` header node. Preconditions require VEMS MainActivity/LoginScreen,
the exact API URL, present token and enabled Sign in, a non-zero authoritative
IME rectangle, a non-editable/non-clickable/non-focusable header wholly outside
that rectangle, and no armed mutation. The tap is derived from the header
bounds and is non-retryable. No Escape, Back, Home, activity restart, or
keyboard-chrome tap is used by this path.

No-token rehearsal: **PASS**. One static-header tap dismissed the real IME,
retained LoginScreen, exposed enabled Sign in, and harmless fields were
cleared. No JWT or Sign-in request was used.

Validation: local Node 20/20, native Windows Node 20/20, Python compatibility
13/13, and `git diff --check` PASS. Windows mirror SHA parity passed.

Authenticated preflight passed, including the retained absolute database,
isolated standard OpenEMR OAuth and zero Stage_Alpha matches, API/Metro,
relays, emulator, and reverse mappings. One fresh 300-second JWT was directly
verified and copied to the Windows clipboard. The first authenticated harness
start stopped before ADB because the orchestrator removed metadata too early;
the corrected launch then stopped before Sign-in because the static-header
precondition correctly rejected a disabled Sign-in button. Evidence showed the
token and header were present, but required STAFF-001/field_crew actor fields
had been cleared by the rehearsal. The harness was corrected to restore those
non-secret fields and to clear retained secure-field bullets before clipboard
paste, but the token had fallen below the requested 180-second pre-sign-in
window. No replacement token was generated.

No authenticated Sign-in, patient search, patient-create, patient-link,
OpenEMR write, or clinical mutation occurred. The only API request correlated
to the attempt was direct readiness verification. Temporary JWT, signing
secret, OAuth credentials, access-token responses, captures, and clipboard
contents were cleaned. C1 remains **BLOCKED before authentication** pending a
future run with the corrected preparation path.

Changed repository files in this attempt:

- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report
## C1 just-in-time authentication attempt — 2026-09-18

The native Windows Node harness was extended with a pre-token `--arm-login`
checkpoint. It requires the authoritative MainActivity/LoginScreen, exact API
URL `http://127.0.0.1:3001`, `STAFF-001`, `field_crew`, an empty secure field,
disabled Sign-in, absent IME, visible unobscured Sign-in, and a valid static
`V-EMS Crew` focus-transfer header. The authenticated path continues to use
that static-header tap only; no Escape, Back, Home, activity restart, or
keyboard-chrome fallback was used.

The retained topology passed preflight: authoritative database
`/home/bighog/repos/vems/V-ems-system/services/api-gateway/.data/platform.sqlite`,
SQLite integrity `ok`, retained `INC-000001`/`ASN-000001`, PCR-000001 with zero
patient links, PCR-000002 with its completed provisional link, isolated
OpenEMR standard OAuth HTTP 200, and standard patient search HTTP 200 with zero
exact Stage/Alpha matches. API health was HTTP 200 with one listener on 3001;
Metro status was `packager-status:running` with the authoritative checkout;
native Windows ADB and existing reverse rules remained available.

The arm checkpoint passed natively (`LOGIN_ARMED`). Exactly one synthetic
300-second STAFF-001/field_crew JWT was then issued at Unix `1789747801`, with
safe metadata length 232, SHA-256 prefix `bd64bf2935b3`, expiry Unix
`1789748101`; direct VEMS readiness verification returned HTTP 200. Clipboard
transfer was performed without displaying the token and was length/hash checked.

The authenticated harness pasted the token successfully, but stopped before
Sign-in because its required 240-second pre-submit gate measured 231 seconds
remaining. This was a bounded timing failure; no Sign-in tap, readiness or
assignment request from the mobile session, patient search, patient-create,
patient-link, or clinical mutation occurred. The API log contained only the
direct readiness verification. PCR-000001 remains unlinked and no Stage/Alpha
OpenEMR patient was created.

Temporary JWT, metadata, signing secret, OAuth files, authenticated token-field
evidence, logcat capture, and clipboard contents were removed. The clipboard
was verified at length zero. Protected environment files, Android data and
SecureStore, Docker volumes, shared OpenEMR 8083, and retained fixture records
were preserved. C1 remains **BLOCKED before rendered Sign-in**; no replacement
token was issued and no mutation was retried.

Changed files in this continuation:

- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report

## Development-only Stage 14 test-session implementation — 2026-09-18

Manual five-minute JWT entry is no longer required for general debug-emulator
acceptance. The new `POST /api/development/test-session` facility is fail-closed:
it requires exact development profile guards and the exact
`VEMS_ENABLE_DEVELOPMENT_TEST_AUTH=true` flag, uses the existing HS256 issuer,
audience and authentication middleware, fixes the identity to synthetic
`STAFF-001`/`field_crew`, adds explicit synthetic-session claims, defaults to a
3600-second development-only TTL bounded to 900–7200 seconds, audits issuance
without bearer material, and applies a five-per-minute issuance limit. Enabled
staging/production or secure-startup configurations fail startup.

The mobile control is rendered only when `__DEV__` and the exact inline public
flag `EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH=true` are both present. It uses
the existing verification, session construction, SecureStore persistence and
`onSignedIn` path; normal token login remains unchanged. Jobs display a
`Synthetic test session` marker. Configuration validation confirms the default
and release-negative states, and the inline setup is documented in
`apps/mobile-crew/BUILD.md`.

Validation passed: mobile TypeScript; mobile unit `218/218`; mobile component
`18/18` suites, `76/76`; mobile configuration validator; local Node harness
`23/23`; focused API development-auth tests `5/5` (combined Node run `28/28`);
`git diff --check`. The native Windows mirror matched the repository harness by
SHA and its prior native test run passed `23/23`.

Native development login reached authenticated jobs with Assigned jobs and
Sign out, and a retained synthetic session was visibly indicated. The first
C1 continuation was blocked by an invalid retained session and was safely
signed out. Subsequent autonomous runs reached ASN-000001, INC-000001,
PCR-000001 and the rendered identity form. They stopped before Search and
before arming or tapping Create and link when native Windows ADB failed during
non-secret last-name entry. No patient-create, patient-link, OpenEMR write,
SQLite mutation, or PCR-000003 occurred; PCR-000001 remains unlinked and
PCR-000002 remains unchanged. C1 is **BLOCKED before identity submission**.

Release-negative evidence: default Expo config omits the feature, explicit
production/release config disables it, and server tests cover absent/false
route 404 plus staging/production fail-closed startup. No secret or token was
added to source, config, lockfiles, or generated resources. The endpoint label
and development button are development-bundle strings guarded by executable
configuration; release behavior is controlled by the server route absence and
release configuration checks.

Files changed for this implementation/continuation:

- `services/api-gateway/src/development-test-auth.mjs`
- `services/api-gateway/src/auth.mjs`
- `services/api-gateway/src/server.mjs`
- `services/api-gateway/test/development-test-auth.test.mjs`
- `apps/mobile-crew/app.config.js`
- `apps/mobile-crew/src/auth/developmentTestSession.ts`
- `apps/mobile-crew/src/auth/session.ts`
- `apps/mobile-crew/src/screens/LoginScreen.tsx`
- `apps/mobile-crew/src/screens/JobsListScreen.tsx`
- `apps/mobile-crew/test/developmentTestSession.test.ts`
- `apps/mobile-crew/test/LoginScreen.jest.test.tsx`
- `apps/mobile-crew/scripts/validate-mobile-config.sh`
- `apps/mobile-crew/BUILD.md`
- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report

No commit, push, merge, tag or publish was performed. Remaining gates are
native ADB/UI text-entry reliability before C1 identity submission, the
retained Vtiger custom-module deployment blocker, and all later connected
clinical sections.

`npx expo-doctor` was also run and reported the repository's existing Expo SDK
dependency drift (16 package version mismatches, including Jest major-version
drift); no dependency upgrade was performed and no lockfile was changed.

## C1 non-secret field-entry continuation — 2026-09-18

The native Windows Node harness now provides `setNonsecretTextField()`. It
targets the current hierarchy bounds, clears and replaces values through the
Windows clipboard plus Android paste, verifies the fresh hierarchy value, and
clears the clipboard after each field. A transport ambiguity is accepted only
when the exact expected value is already rendered; empty or divergent values
have one bounded replacement opportunity, with no uncontrolled retry loop and
no `adb input text` use. The C1 path uses it for Stage, Alpha, and
2000-01-02; Sex remains an explicit rendered control entry.

Local Node harness tests passed `29/29`, native Windows Node harness tests
passed `29/29`, Python compatibility tests passed `13/13`, focused patient
identity tests passed `8/8`, and focused orchestration patient-case tests passed
`16/16`. `git diff --check` passed. The retained SQLite database passed a
read-only integrity check (`ok`).

The one autonomous development-session run reached ASN-000001, INC-000001,
PCR-000001, and the rendered identity form. All three non-secret fields were
entered and verified. Search was tapped exactly once; the UI rendered
`RESULTS (NOT_FOUND)` and `No matching patients found.`. The harness assertion
was corrected to accept the rendered terminal punctuation without repeating
Search.

The non-mutating “None of these — create a new patient” transition then failed
to render the create form after the bounded harness tap and one permitted
fresh-bounds navigation retry. No `create-sex` or Create-and-link control was
rendered, so the mutation was not attempted. API correlation shows one
successful authenticated `POST /api/patients/search`; there were no patient
create or patient-link requests. Read-only retained-database checks show
`PCR-000001` has no link, `PCR-000002` retains its single provisional link to
`a2c6406b-c7a5-4b61-b99c-99141a3d0f11`, and `PCR-000003` count is zero.

C1 remains **BLOCKED before patient creation**. The remaining issue is a
rendered UI navigation/control-dispatch problem for the non-mutating create-form
button, not field entry or authentication. No patient, OpenEMR, SQLite,
assignment, incident, or Docker data was changed by this continuation.

Changed files in this continuation:

- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report

No commit, push, merge, tag, or publish was performed. Temporary API,
credential, token, clipboard, and sensitive capture material was cleaned; the
Windows clipboard was verified at length zero. Protected environment files,
Android application data/SecureStore, Docker volumes, shared OpenEMR 8083, and
retained synthetic records were preserved.

## C1 rendered create-new control correction — 2026-09-18

Source diagnosis confirmed that the identity screen rendered the create form
implicitly as soon as a no-match search completed (`setShowCreateForm(true)`).
The form was therefore below the visible ScrollView viewport while the visible
“None of these — create a new patient” Pressable remained present; waiting for
the form immediately after pressing that already-active control was not a
reliable state transition. The action itself was not a patient mutation.

The smallest correction was to keep the form closed after search and reveal it
only through the explicit rendered action. That Pressable now owns the named
handler, has `testID="patient-create-new-option"`, button semantics, an explicit
enabled accessibility state, and the form container has
`testID="patient-create-form"`. Create and link remains the only patient
mutation. Component coverage proves a no-match search, one or repeated
non-mutating option presses, retained Stage/Alpha/DOB/Sex values, and zero
create calls while opening the form.

Validation after the correction: mobile TypeScript passed; mobile component
tests passed `18/18` suites and `77/77`; local Node harness tests passed `30/30`;
native Windows Node harness tests passed `30/30`; Python compatibility tests
passed `13/13`; `git diff --check` passed.

The emulator continuation was not claimed. The existing retained identity UI
was not retried after the source correction because its bundle had not yet been
reloaded with the new source, and the retained isolated OpenEMR host port was
reachable from Windows but not from the current WSL process. No development
session was issued, no Search was repeated, and no Create-and-link action was
performed. Read-only SQLite evidence remains: PCR-000001 has no link,
PCR-000002 retains its single provisional link, and PCR-000003 count is zero.
C1 remains **BLOCKED pending authoritative Metro reload plus restored isolated
OpenEMR/API reachability**.

Changed files in this correction:

- `apps/mobile-crew/src/screens/PatientIdentityScreen.tsx`
- `apps/mobile-crew/test/PatientIdentityScreen.jest.test.tsx`
- `scripts/stage14/android-ui-driver.mjs`
- `scripts/stage14/android-ui-driver.test.mjs`
- this report

No commit, push, merge, tag, or publish was performed.

## C1 WSL-to-isolated-OpenEMR topology diagnosis — 2026-09-18

The retained topology was inspected without recreating containers or touching
protected environment files. `vems-openemr-stage14-installer` is running with
host port `8085 -> 80` on Docker network `vems-stage14-openemr-net`, container
address `172.27.0.3`; its retained MySQL dependency is
`vems-mysql-stage14-openemr-test2` at `172.27.0.2` on the same network.
Vtiger remains on retained host port 8080 and Redis remains healthy on retained
port 6380. The WSL address is `172.22.103.130` with default gateway
`172.22.96.1`.

Windows-side checks passed: `http://127.0.0.1:8085/` returned HTTP 200 and
isolated OAuth discovery returned HTTP 200. WSL-side bounded probes failed for
all available candidates: `host.docker.internal` (resolved by `getent` to
`192.168.88.34` but not reachable on 8085), `192.168.88.34:8085`, the WSL
gateway `172.22.96.1:8085`, and the retained container address
`172.27.0.3:80`. OpenEMR itself remains healthy when checked locally inside the
retained container. No shared OpenEMR port 8083 was accessed or changed.

This establishes a host-boundary networking failure: Windows loopback port 8085
is not exposed on a WSL-reachable host/gateway interface, while Docker’s
container network is not reachable from the current WSL process. No Windows
portproxy or firewall/network change was made because the requested rule is to
stop and report before modifying Windows networking when all supported routes
fail. The temporary API was not started, no development session was issued,
and Android Search/Create-and-link was not retried. No patient, OpenEMR, SQLite,
Docker-volume, Android-data, or SecureStore mutation occurred.

Validation remains green for the correction: mobile component tests `18/18`
suites and `77/77`, local/native harness tests `30/30`, Python compatibility
tests `13/13`, and `git diff --check`. C1 remains **BLOCKED pending an approved
WSL-to-Windows 8085 route**. The next safe action is to review and authorize a
specific Windows networking route (or expose the existing 8085 binding on a
WSL-reachable interface); no such change was made in this run.

## C1 approved relay continuation — 2026-09-18

The approved WSL-to-Windows relay was used without modification:
`http://172.22.96.1:18085` to Windows `http://127.0.0.1:8085`. OpenEMR root
redirect/readiness, OAuth discovery, OAuth token issuance, invalid-client
rejection, authenticated patient search, VEMS health/readiness, assignments,
Vtiger readiness, and the absolute authoritative database path all passed.
SQLite integrity was `ok`; PCR-000001 had zero links, PCR-000002 retained one
provisional link, PCR-000003 was absent, and the isolated OpenEMR search for
Stage/Alpha returned zero matches.

The first continuation stopped before mutation because the restarted API used a
new process-only JWT signing secret while Android still held an older persisted
development session. The rendered error was `JWT signature validation failed`;
no patient request followed. The stale session was removed through the rendered
Sign out control, and the development test login then issued a fresh session.

After an authoritative Metro cache-clear/reload, the current bundle exposed
`patient-create-new-option` and `patient-create-form`. The native Windows driver
completed authentication, assignment/incident/PCR navigation, identity entry,
zero-match Search, and create-form navigation. The Sex field was below the
visible ScrollView viewport, so one bounds-derived scroll revealed it; `X` was
verified. The single guarded Create-and-link tap was then dispatched exactly
once, but the UI did not reach its expected post-success state within 30
seconds. Read-only reconciliation found no patient-create request, no
PCR-000001 link, no new OpenEMR patient, and no new patient-link audit event.
The pre-existing audit action was only the PCR-000002 provisional link.

Post-attempt evidence: isolated OpenEMR Stage/Alpha search remained
`not_found` with zero candidates; PCR-000001 remained unlinked; PCR-000002's
one provisional link to `a2c6406b-c7a5-4b61-b99c-99141a3d0f11` was unchanged;
PCR-000003 count was zero; SQLite integrity remained `ok`. C1 is therefore
**BLOCKED before patient creation/linkage**. The mutation tap was not retried.

The remaining issue is a deterministic UI/backend handoff failure after the
single rendered mutation tap, requiring a future read-only request correlation
and application error diagnosis before another mutation attempt. No Docker
volume, shared OpenEMR 8083 data, Android application data, SecureStore,
protected environment file, relay, or firewall rule was changed. Temporary API,
OAuth, token, credential, and clipboard material was cleaned; Windows clipboard
length was verified as zero.

Continuation changes: this report only. Temporary harness helper files were
removed. No commit, push, merge, tag, or publish was performed.
