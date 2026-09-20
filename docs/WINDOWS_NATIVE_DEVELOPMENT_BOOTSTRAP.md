# Windows-native development

This is the authoritative development guide. Historical Stage 14 reports describe
retained environments and are not startup instructions. Work in the Windows Git
checkout, never in a WSL mount.

Prerequisites: Docker Desktop using Linux containers, Windows Node.js 24 and npm,
Windows PowerShell 5.1, Android Studio with its Pixel_Tablet AVD, and an Android SDK.
Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`); the default is `%LOCALAPPDATA%\Android\Sdk`.
Set `JAVA_HOME` to JDK 17.
`build-mobile-debug.ps1 -JavaHome <path>` accepts another JDK 17 installation.
Keep Docker Desktop running. Start Pixel Tablet through Android Studio's Device
Manager (the scripts use SDK adb directly and do not automate Android Studio).

Run commands below from the repository root. Execution-policy bypass applies only
to each process; never change machine-wide policy.

| Task | Command (append to `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`) |
| --- | --- |
| First initialization | `.\scripts\windows\bootstrap-development.ps1` |
| Everyday start/repair | `.\scripts\windows\start-development.ps1` |
| Windows Metro | `.\scripts\windows\start-mobile-metro.ps1` |
| Complete validation, including emulator | `.\scripts\windows\test-development.ps1 -Android` |
| Static validation only | `.\scripts\windows\test-development.ps1 -StaticOnly` |
| Debug APK | `.\scripts\windows\build-mobile-debug.ps1` |
| Install and launch | `.\scripts\windows\install-mobile-debug.ps1` |
| Non-mutating Android smoke | `.\scripts\windows\test-mobile-smoke.ps1` |
| Stop, retain volumes | `.\scripts\windows\stop-development.ps1` |
| Explicit volume reset | `.\scripts\windows\reset-development.ps1` |

Bootstrap installs locked npm dependencies, initializes an external environment,
builds the dependency images, provisions integration identities, runs migrations,
and seeds one synthetic crew member. Repeated starts preserve credentials and
volumes. `-SkipBuild` skips image builds when source is unchanged. No real patient
records or clinical observations are seeded. The seed command inside the API is
`node scripts/windows/seed-development.mjs`; rerunning it is idempotent.

| Service | Compose service | Windows endpoint | Emulator endpoint |
| --- | --- | --- | --- |
| API | api | http://127.0.0.1:3001 | http://10.0.2.2:3001 |
| Metro (Windows process) | none | http://127.0.0.1:8081 | http://10.0.2.2:8081 |
| Vtiger | vtiger | http://127.0.0.1:8080 | not used directly |
| OpenEMR | openemr | http://127.0.0.1:8083 | not used directly |
| MySQL | mysql | 127.0.0.1:3307 | not used directly |
| Redis | redis | 127.0.0.1:6380 | not used directly |

Project name is always `vems-dev`; Compose generates names such as
`vems-dev-api-1`. Containers use Compose DNS (`mysql:3306`, `redis:6379`,
`http://vtiger`, `http://openemr`). Legacy projects are never adopted.
Development HTTP endpoints must not be exposed to untrusted networks.

Secrets live only in `%LOCALAPPDATA%\VEMS\development.env`. The directory ACL
allows the current user; generated values use cryptographic randomness and are
written atomically. A verified unused placeholder template may be preserved as
`development.env.unconfigured` and replaced. Populated invalid environments fail
closed; repair their structure without rotating credentials. Never print the
file, resolved Compose configuration, OAuth responses, or container environments.
Fresh SQLite data lives in `%LOCALAPPDATA%\VEMS\data\windows-development.sqlite`.
Compose volumes contain MySQL, Redis, Vtiger and OpenEMR development state.
Generated Android files and APKs stay under ignored `apps/mobile-crew/android`.
Never stage these, keys, captures, or runtime files.

The APK build reports package ID `org.vems.mobilecrew`, version name/code, byte
size and SHA-256. Install uses `adb install -r`, retaining app data. The separate
`-CleanInstall` option requires explicit typed confirmation. Emulator commands
require one online emulator or `-Device emulator-NNNN`, wait for boot completion,
and reject reverse rules. Tap **Development sign in** to obtain a short-lived
session without copying a JWT. It requires both debug/development configuration
and explicit development-auth flags; release configuration disables it.

The smoke command performs API/Metro connectivity checks from the emulator,
checks the rendered LoginScreen/jobs screen, signs in if the development action
is present, and checks application errors. It never opens a job, performs C2,
or writes a clinical record. Empty jobs are expected in a fresh database.

Port conflicts fail before startup and identify the owning container or PID.
Inspect the owner before stopping anything. A retained `vems-redis-dev` on 6380,
or an existing Metro on 8081, must be explicitly stopped by its owner before the
canonical service can bind. Stopped legacy containers can retain port mappings
without occupying the port. Never remove legacy containers or volumes to fix a
collision. Do not use alternate relays to hide the conflict.

Normal stop retains all volumes. Reset lists project resources and requires
`RESET VEMS DEV VOLUMES`. It removes only Compose-managed development volumes;
the external SQLite file and secrets are retained. Reset is never part of
bootstrap or repair. Do not execute it on retained projects.

Codex should use these entry points, inspect sanitized errors, run focused tests,
and stop services it started when validation is complete. Keep pre-existing
processes and retained environments untouched. Docker/SDK/runtime access outside
the checkout may require sandbox approval. No WSL IPs, portproxy, socat, WSL-hosted
Metro/API, or adb reverse belong to this topology: Android's `10.0.2.2` already
reaches the Windows host.

Automated checks:

```powershell
node --test --test-concurrency=1 services/api-gateway/test/*.test.mjs services/orchestration/test/*.test.mjs
npm.cmd run test:unit -w @vems/mobile-crew
npm.cmd run test:component -w @vems/mobile-crew -- --runInBand
npm.cmd run typecheck -w @vems/mobile-crew
npm.cmd run test:config -w @vems/mobile-crew
```

Use the supported OpenEMR installer and client repository, and the pinned project
Vtiger distribution with vtlib module provisioning. Do not read or reuse
`infra/.env.development`, its backup, or the authoritative WSL Stage 14 database.

## Operational notes

- The API is published on `127.0.0.1:3001` only. The development test-session
  endpoint mints a token without credentials, so it must never be reachable from
  the LAN. The emulator reaches it through `10.0.2.2`.
- OpenEMR 8.3.0 does not compare the client secret for the OAuth password grant
  (upstream only does so for `authorization_code`). Service validation therefore
  proves rejection with an unregistered client id and an invalid user password,
  not a wrong secret. Do not weaken this to make a check pass.
- Vtiger provisioning creates each VEMS module's `modules/<Name>/<Name>.php`
  CRMEntity class, its language file and its entity identifier
  (`vems_external_key`). Without the class file Vtiger's webservice answers
  "Attempt to access restricted file" for every VEMS module. Provisioning is
  idempotent and safe to repeat.
- `/api/support/readiness` checks OpenEMR and Vtiger reachability
  (`UPSTREAM_CONNECTIVITY_CHECKS_ENABLED`). Vtiger's `/` redirects to its
  host-only site URL, so readiness pings the webservice endpoint (Vtiger) and the
  OAuth discovery document (OpenEMR) instead.
- Every bootstrap or start rebuilds the api, openemr and vtiger images and
  recreates those containers. Volumes, credentials, accounts, clients, modules
  and the SQLite database are unchanged; no duplicates are created.
- Shell tests under `infra/**/test` need LF line endings, GNU `grep`/`rg`, and a
  working OpenSSL. On a Windows checkout with CRLF working files, run them from a
  `git archive` export or a Linux container. PHP lint can use the local
  `vems-dev/openemr:development` image: `docker run --rm --network none
  --entrypoint php -v <export>:/w:ro vems-dev/openemr:development -l /w/<file>`.
- `test:config` runs `expo prebuild` in place. Back up `apps/mobile-crew/android`
  before running it on a checkout with a native directory you care about.
## Synthetic clinical workflow data

`node scripts/windows/seed-development-workflow.mjs` (host, API on 3001, stack running) creates the
records the mobile app needs: vehicle AMB-001, incident INC-000001 assigned to STAFF-001, a patient
case linked to one synthetic OpenEMR patient, an open encounter, a primary-survey assessment and one
set of vitals. It signs in through the development test session and uses fixed idempotency keys and
values; dispatch status changes are applied only once. It creates no real patient data. Run it once on
a fresh database; the same keys make a repeat run a no-op. Pending Vtiger sync intents stay pending
because no sync worker runs in the development stack; the mobile app reads from the VEMS API.

- The development OpenEMR client is registered with read and write scopes for `patient`, `encounter`,
  `vital` and `soap_note`, plus read for `medication` (`OPENEMR_SCOPE`). Bootstrap syncs that key into an existing runtime file
  and updates the registered client; credentials are never rotated.
- The integration user belongs to OpenEMR's `Physicians` ACL group: the encounter-create route needs
  `encounters:auth_a`, which `Clinicians` lack (HTTP 403 "Organization policy does not have permit
  access resource").
- An HTTP 4xx from OpenEMR on encounter creation is a proven pre-write denial, so the reservation is
  released for a retry. A failure with no HTTP status (lost response, timeout) still leaves the
  reservation pending and requires reconciliation.
- Metro (`start-mobile-metro.ps1`) is a long-running Node process, and bulk file changes inside the tree it watches
  can pin it at 100% CPU and end in a 4 GB out-of-memory crash (measured; see the Stage 14 execution report). Every
  `bootstrap-development.ps1` runs `npm ci`, and a Gradle build rewrites thousands of files. **Stop Metro before
  running either, and start it again afterwards.** If the app shows a blank screen, check
  `http://127.0.0.1:8081/status` and restart Metro. The job list loads on app start and on pull to refresh, so restart
  the app (data is kept) after changing server-side records.