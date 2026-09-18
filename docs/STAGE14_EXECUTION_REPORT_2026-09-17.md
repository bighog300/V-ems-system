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
