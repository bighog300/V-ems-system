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
