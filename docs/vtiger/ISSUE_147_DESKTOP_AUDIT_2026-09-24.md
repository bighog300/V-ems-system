# Issue #147 desktop baseline audit — blocked live gate

Recorded 24 September 2026, approximately 09:51 Europe/London (08:51 UTC).
Repository SHA: `f74fe370e14d54ddebe67c85d4e42769d48017dd`.
Initial working tree: clean (`git status --short` returned no entries).
This report is local evidence prepared for #147; it has not been posted to GitHub.

## Blocking condition

The requested `vems-dev` project already existed and all five application services
were running before this audit. `%LOCALAPPDATA%\VEMS\development.env` and
`%LOCALAPPDATA%\VEMS\data\windows-development.sqlite` already existed. Only file
metadata was inspected; their contents were not read. The existing database's
provenance and suitability for disposable testing are unverified.

`bootstrap-development.ps1` invokes environment initialization and startup.
The initializer preserves existing credentials and synchronizes the scope key;
startup builds images, starts/recreates services, provisions accounts/modules,
and seeds the existing database. Running it here would violate the explicit
instruction not to use existing credentials. Changing LOCALAPPDATA alone would
not isolate the existing Compose project and named volumes.

Consequently bootstrap and ServicesOnly were **not run**, rather than attempted
against prohibited resources. No failure of either script is claimed. A separate
disposable Docker context/desktop with free ports and a fresh runtime directory,
or explicit clarification authorizing this existing synthetic stack and its
credentials, is required to continue. A clarification was requested.

## Desktop and command evidence

- Docker CLI and daemon reachable: Engine 29.6.2, Docker Desktop 4.84.0,
  context `desktop-linux`, Linux containers.
- Before testing, `vems-dev-api-1`, `vems-dev-openemr-1`, `vems-dev-vtiger-1`,
  `vems-dev-mysql-1`, and `vems-dev-redis-1` were running and Docker reported healthy.
- Ports 3001, 8083, 8080, 3307, and 6380 were already published on loopback by
  those respective services. Windows listener owner was Docker backend PID 17000.
  These are existing-project occupancies, not unrelated-service collisions.
- No listener was observed on 8081. Other Docker projects and a retained
  `vems-mysql-dev` container were observed but not modified or queried for data.
- Native execution initially failed before process creation with
  `helper_unknown_error: setup refresh had errors`, including for `Get-Location`.
  Approved execution outside that failing sandbox succeeded.
- Root `AGENTS.md` was absent. Both requested audit/bootstrap documents were read.

Requested command sequence and actual status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-development.ps1 -StaticOnly
# EXECUTED, exit 0:
# PowerShell parser validation passed.
# Environment unit tests passed.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\bootstrap-development.ps1
# NOT EXECUTED: existing credentials/project/data conflict with audit constraints.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-development.ps1 -ServicesOnly
# NOT EXECUTED: would validate using the prohibited existing credentials/stack.
```

Other executed diagnostics: `Get-Location`, `git rev-parse HEAD`,
`git status --short`, `Get-Command docker`, `docker version --format '{{json .}}'`,
`docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}'`, filtered
`Get-NetTCPConnection`, metadata-only `Get-Item` for the runtime files,
`Get-Process -Id 17000`, source reads/searches with `Get-Content` and `rg`,
`node infra/services/vtiger/validate-field-ownership.mjs`, filtered
`docker logs --since 10m vems-dev-api-1`, and a final filtered `docker ps`.
An initial Docker listing template containing a quoted project-label key failed
to parse; the simpler listing above succeeded. `docker top vems-dev-api-1 -eo comm`
failed because Docker required a PID column; no conclusion was based on it.
No resolved Compose configuration, credential contents, or raw log payloads were
printed. Log output was restricted to an anchored allowlist of numeric cycle
counters, timestamps, and status counts.

## Module and role evidence

The source ownership validator exited 0: `Vtiger ownership contract covers 8 modules`.
This proves source registry coverage only, not live field types or enforcement.

| Module | Source schema/ownership coverage | Menu/list/detail/fields/links/edit controls | Live describe/query |
| --- | --- | --- | --- |
| HelpDesk | PASS | NOT RUN | NOT RUN |
| VEMSAssignments | PASS | NOT RUN | NOT RUN |
| VEMSVehicles | PASS | NOT RUN | NOT RUN |
| VEMSPersonnel | PASS | NOT RUN | NOT RUN |
| VEMSAssignmentCrew | PASS | NOT RUN | NOT RUN |
| VEMSStockItems | PASS | NOT RUN | NOT RUN |
| VEMSVehicleStock | PASS | NOT RUN | NOT RUN |
| VEMSStockUsage | PASS | NOT RUN | NOT RUN |

| Role | UI reads/writes | Webservice reads/writes | Denied mirrored-state write |
| --- | --- | --- | --- |
| Dispatcher | NOT RUN | NOT RUN | NOT RUN |
| Fleet manager | NOT RUN | NOT RUN | NOT RUN |
| Stock manager | NOT RUN | NOT RUN | NOT RUN |
| Supervisor | NOT RUN | NOT RUN | NOT RUN |
| Integration user | NOT RUN | NOT RUN | NOT RUN |

No synthetic records were created; no authenticated UI session was opened.
No screenshots or live describe/query exports were captured. This is an evidence
gap, not a passed UI audit. Service validation, integration navigation,
canonical/mirror divergence checks, remote-ID/audit-ID comparisons, denied writes,
and Vtiger outage/recovery all remain **NOT RUN**.

## Worker finding and safe mirroring test boundary

The current development stack **does run a sync worker**. The Compose source sets
`SYNC_WORKER_ENABLED: "true"`; `services/api-gateway/src/server.mjs` starts
`runSyncWorkerService` using the API's shared database handle. Strictly filtered
runtime logs independently confirmed worker cycles:

```text
[sync-worker] cycle=120 started_at=2026-09-24T08:51:22.703Z finished_at=2026-09-24T08:51:22.705Z poll_ms=2000 batch_size=100 fetched=0 statuses={}
[sync-worker] cycle=121 started_at=2026-09-24T08:51:24.707Z finished_at=2026-09-24T08:51:24.708Z poll_ms=2000 batch_size=100 fetched=0 statuses={}
```

121 matching cycle lines were found in the ten-minute log window. Idle cycles
prove worker activity, not successful delivery, queue completeness, or recovery.
The guide's statement that no development worker runs is stale at this SHA.

Once a disposable environment is available, use the embedded worker and shared
SQLite handle. Do not start a second worker against the same SQLite bind mount.
Create uniquely tagged synthetic records through V-EMS, then correlate canonical
records, sync intents, remote IDs and audit IDs before checking Vtiger links.
For outage testing, stop only that audit-owned Vtiger service, submit a synthetic
operational update, capture pending/retry evidence, restart it, and verify eventual
state and stable remote IDs. This procedure is proposed, **not executed or proven**.

## Source discrepancies and proposed follow-up PRs

1. Correct the bootstrap guide's no-worker statement and document embedded-worker
   health evidence and the disposable outage/mirroring procedure.
2. Add a Windows audit preflight/isolation mechanism that rejects an existing
   project or requires explicit provenance/authorization before credential/data
   reuse; support a separately scoped disposable environment without resetting
   retained resources.
3. Version typed Vtiger field and relationship provisioning. The inspected
   development provisioner adds missing fields as optional `VARCHAR(255)`,
   `uitype=1`, except owner fields (`uitype=53`). Thus newly provisioned reference,
   quantity, and date fields are not given corresponding relationship/numeric/date
   types by this code. Existing live field definitions remain unverified.
4. Provision and test the five management/integration roles and enforce ownership
   on UI and webservice writes. The inspected provisioner creates an integration
   user assigned to H2; it does not establish the requested management-role matrix.
   The ownership JSON alone does not prove enforcement. Actual access remains unknown.
5. Complete #147's live evidence bundle once isolation is resolved: eight-module
   screenshots and describe/query comparisons, five-role positive/negative tests,
   linked synthetic workflow, divergence check and outage recovery evidence.

No follow-up PRs/issues were opened. No containers, volumes, databases, credentials,
or services were deleted, reset, stopped, or changed by this audit. No services
were started, so none required shutdown. Pre-existing services remained running
and volumes were retained. Issue #147 and the management acceptance gate remain open.

## Continuation: isolated desktop execution (24 September 2026)

This section supersedes the blocked execution status above; the earlier report is
preserved as the historical preflight. At continuation start, HEAD was still
`f74fe370e14d54ddebe67c85d4e42769d48017dd` and the only working-tree entry was this
untracked report. Remote main was subsequently verified at that same SHA.

**Result: partial live baseline, acceptance NOT PASSED.** Isolation, bootstrap,
service validation, all eight module webservices, synthetic mirroring and a real
outage/manual replay were exercised. The write-divergence check FAILED. Four
requested manager roles are absent. UI/navigation/screenshots remain NOT RUN
because the browser tool returned no available browsers/apps and explicitly
rejected Chrome. No substitute API result is counted as UI evidence.

### Implemented isolation and preservation

See [DESKTOP_AUDIT.md](DESKTOP_AUDIT.md) for the reviewable procedure and
`infra/docker-compose.audit.yml`, `scripts/windows/vtiger-audit.ps1`, and
`scripts/windows/vtiger-audit.mjs` for implementation.

- Fixed project `vems-audit-147`; separate built image tags under that name.
- Newly generated credentials in `%LOCALAPPDATA%\VEMS-Audit\issue-147\audit.env`;
  database in its `data\audit-147.sqlite`; no existing development credentials read.
- Loopback ports API 13001, MySQL 13307, Redis 16380, Vtiger 18080, OpenEMR 18083.
- Network `vems-audit-147_vems-network`; six explicitly named, project-prefixed
  volumes, including OpenEMR's SSL and Let's Encrypt volumes.
- Resolved Compose JSON was checked in memory for project, services, ports,
  images, volumes, network, mounts, database and upstream destinations. It was
  never printed. Only the allowlisted resource summary was emitted.
- The runner rejects unowned first-run resources, runtime/context mismatches,
  development resource mappings and concurrent operations. Caller Compose
  interpolation overrides are filtered out. The command interface exposes no
  project, path or arbitrary Compose-argument override.
- Final Stop stopped only verified audit container IDs. Six named volumes,
  external runtime data, and two initial anonymous OpenEMR certificate volumes
  were retained. No volume was deleted. No reset script was used.
- Original `vems-dev` IDs remained running and healthy throughout final checks:
  API `e0128865bef8`, OpenEMR `9e210a9ab414`, Vtiger `2faa13a78b40`, MySQL
  `6ddfda073224`, Redis `fafb564722ed`. No command started, stopped, rebuilt,
  provisioned or changed those services. See [shutdown evidence](evidence/issue-147/shutdown.json).

### Executed commands and bootstrap failures

All commands ran from the repository root through the approved native Windows
execution path. The file-edit sandbox helper continued to fail; source edits
used PowerShell with literal here-strings and Node file APIs. No shell interpolated
secret values. Docker subprocess arguments were supplied as arrays for diagnostics.

```powershell
node --test scripts/windows/vtiger-audit.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-development.ps1 -StaticOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Inspect
node scripts/windows/vtiger-audit-live.mjs describe
node scripts/windows/vtiger-audit-live.mjs seed
node scripts/windows/vtiger-audit-live.mjs snapshot
node scripts/windows/vtiger-audit-live.mjs denied-write
node scripts/windows/vtiger-audit-live.mjs roles
node scripts/windows/vtiger-audit-live.mjs relationships
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Outage
node scripts/windows/vtiger-audit-live.mjs outage-update
node scripts/windows/vtiger-audit-live.mjs snapshot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Recover
node scripts/windows/vtiger-audit-live.mjs recovery
node scripts/windows/vtiger-audit-live.mjs replay
node scripts/windows/vtiger-audit-live.mjs recovery
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Stop
git diff --check
git ls-remote origin refs/heads/main
```

Start was attempted five times while fixing the following issues, without resets:

1. Initial dependency startup returned Compose exit 1. Audit OpenEMR logs showed
   transient root-database connection errors; a later credential-suppressed PHP
   connection probe returned `root-connect-errno=0`. The original Compose stderr
   was suppressed, so its exact causal link to that first failure is unconfirmed.
2. Inspect/retry correctly rejected upstream OpenEMR's two implicit anonymous
   certificate mounts. The overlay now declares isolated named mounts. The initial
   anonymous volumes were verified exclusive to the newly created audit container,
   retained, and replaced by named mounts on audit-container recreation. That
   temporary compatibility allowance was removed from the final runner.
3. Fresh OpenEMR integration-user creation failed: `Password not strong enough`.
   The random base64url password lacked a required character class. Audit generation
   now guarantees all classes. Only the not-yet-provisioned audit integration
   password was adjusted; the existing development credentials were untouched.
4. Provisioning next failed with `in_array(): Argument #2 ($haystack) must be of
   type array, null given`. OpenEMR returns null for a new user's absent ACL groups.
   The provisioner now treats that as an empty list before assigning Physicians.
5. After those fixes, audit bootstrap exited 0; separate Validate also exited 0.

Other diagnostic failures were tooling-only: Python was unavailable (edits were
then performed with Node); a concurrent read attempt was correctly rejected by
`operation.lock`; Vtiger PHP deprecation output initially prevented role JSON
parsing (the helper now buffers startup notices and emits only selected JSON).
The audit API exited 1 when Stop delivered SIGTERM to its npm wrapper; logs reported
`npm error signal SIGTERM`. All audit containers were stopped, and the shutdown
exit is recorded rather than presented as a clean application exit.

Read-only role diagnostics execute `scripts/windows/vtiger-audit-roles.php` via
stdin in `vems-audit-147-vtiger-1` with the audit-only guard variable. SQLite evidence
uses `node:sqlite` read-only inside `vems-audit-147-api-1`, not a second sync worker.
PHP lint ran in the two audit containers against `/opt/vems/provision-development.php`.
Snapshots were copied to `before-outage.json`, `outage-pending.json`,
`outage-final.json`, and `recovery-before-replay.json` before subsequent captures.

### Module schema and webservice results

[Full sanitized describe evidence](evidence/issue-147/describe.json) records field
names, labels, types, mandatory/editable flags, ownership classifications and
query results. All eight describes and queries succeeded; no expected fields
were missing. Each custom module additionally exposes standard webservice `id`.
HelpDesk exposes 14 additional built-in fields, including `id`; these are recorded
as outside the VEMS ownership registry, not automatically treated as new VEMS fields.

| Module | Describe/query | Expected mirrored fields editable for integration user | UI/list/detail/navigation |
| --- | --- | --- | --- |
| HelpDesk | PASS | 18/18 | NOT RUN |
| VEMSAssignments | PASS | 15/15 | NOT RUN |
| VEMSVehicles | PASS | 11/11 | NOT RUN |
| VEMSPersonnel | PASS | 10/10 | NOT RUN |
| VEMSAssignmentCrew | PASS | 10/10 | NOT RUN |
| VEMSStockItems | PASS | 11/11 | NOT RUN |
| VEMSVehicleStock | PASS | 13/13 | NOT RUN |
| VEMSStockUsage | PASS | 12/12 | NOT RUN |

Every inspected custom `*_ref` field is a **string**, not a Vtiger reference.
Quantity and custom timestamp fields also use generic text provisioning. Remote
IDs are correctly transported in reference-named fields, but actual UI hyperlinks
and related lists have not been tested. Source mapper keys such as vehicle
`vems_notes` and personnel `vems_callsign`, `vems_phone`, `vems_email`, `vems_notes`
are absent from live describe. No personnel contact data was supplied or copied;
this audit does not establish the transport behavior of those optional keys.

### Actual roles and denied writes

[Role inventory](evidence/issue-147/roles.json) shows only Organization, CEO,
Vice President, Sales Manager and Sales Person. There are two active accounts:
administrator and non-admin integration user, both assigned H2/CEO.

| Requested role | Actual result |
| --- | --- |
| Dispatcher | MISSING; cannot log in or verify intended read/write policy |
| Fleet manager | MISSING; cannot log in or verify intended read/write policy |
| Stock manager | MISSING; cannot log in or verify intended read/write policy |
| Supervisor | MISSING; cannot log in or verify intended read/write policy |
| Integration user | Authenticated reads of all eight modules PASS; vehicle update ACCEPTED |

[Denied-write evidence](evidence/issue-147/denied-write.json): direct webservice
update changed the synthetic vehicle mirror from `Available` to `Out of Service`.
The canonical API still returned `Available`. Therefore the prohibition on silent
mirrored operational-state divergence **FAILS** for the integration account.
No missing manager account was fabricated and reported as a verified baseline role.
UI permission checks remain unperformed for every role. Invalid Vtiger credentials
were rejected during service validation, which is distinct from role authorization.
The development API's RBAC enforcement is disabled by its current default; the
synthetic field-crew session successfully performed the operational fixture writes.
That is not evidence of production-role enforcement.

### Mirroring, outage and recovery evidence

[Seed evidence](evidence/issue-147/synthetic-seed.json) and
[pre-outage links/intents](evidence/issue-147/before-outage.json) show creation of
one audit person, vehicle, stock item, restock, incident and assignment through
V-EMS. Seven Vtiger intents, including the bootstrap crew mirror, succeeded.
The assignment-crew junction was created as part of assignment mirroring.
[Relationship comparisons](evidence/issue-147/relationships.json) passed all six
remote-ID comparisons: assignment→incident, assignment→vehicle, crew→assignment,
crew→person, vehicle-stock→vehicle and vehicle-stock→stock-item. No stock-usage
clinical intervention was created; VEMSStockUsage query/describe passed with no
synthetic usage record. No clinical or real patient record was created.

[Worker evidence](evidence/issue-147/worker.json) confirms polling and successful
non-idle cycles inside the isolated API. Compose sets `SYNC_WORKER_ENABLED=true`;
`server.mjs` invokes `runSyncWorkerService` with the API's shared SQLite handle.
The stale guide statement has been corrected. No separate worker was started.

The outage sequence was actually executed:

- Vtiger was stopped using audit Outage. At **09:11:58.414 UTC**, V-EMS accepted
  the synthetic vehicle callsign update and wrote audit event **11** with correlation
  `audit-147-outage-update`; sync intent **9** was created. The mirror was unreachable.
- [Pending evidence](evidence/issue-147/outage-pending.json) captured processing.
  At **09:12:16.909 UTC**, intent 9 was dead-lettered after **3 attempts**, classified
  `DOWNSTREAM_UNAVAILABLE`; see [outage-final](evidence/issue-147/outage-final.json).
- Vtiger was restarted. [Before replay](evidence/issue-147/recovery-before-replay.json),
  intent 9 remained dead-lettered and the mirror retained both its old callsign and
  the deliberately divergent status. **Automatic recovery after retry exhaustion
  did not occur.**
- The supported `POST /api/support/sync-intents/9/replay` endpoint was called only
  for the audit intent. At **09:13:20.753 UTC**, it succeeded. The
  [final recovery evidence](evidence/issue-147/recovery.json) shows callsign agreement,
  status restored to `Available`, stable remote ID **37x4**, and original canonical
  audit event **11** still correlated with the intent. Replay resets attempt_count
  to zero; the retained pre-replay snapshots preserve the three failed attempts.

Manual replay convergence PASS; automatic recovery after dead-lettering FAIL.
The broader integration/UI walkthrough remains incomplete. A later canonical
update repairing a mirror does not make the original direct-edit divergence safe.

### Validation, remaining gaps and follow-up PRs

- Isolation/password tests: **19 passed**. Windows StaticOnly: **PASS**.
- OpenEMR and Vtiger provisioner PHP syntax checks: **PASS**.
- Bootstrap and separate service validation: **PASS** after the recorded fixes;
  [check list](evidence/issue-147/service-validation.json).
- Browser calls: `cua.getBrowser({url:'http://127.0.0.1:18080'})` returned
  `No browser is available`; `cua.getState()` returned empty apps/browsers;
  explicit Chrome creation returned `Browser is not available: chrome`.
  A connection was requested. **No screenshots exist and no UI test passed.**
- A reviewable PR is being prepared for isolation scripts, the fresh-user ACL fix,
  procedure, corrected worker documentation and this evidence. It must not close #147.
- Follow-up: enforce mirrored-field ownership on UI and webservice writes;
  provision/version the intended five-role policy and test actual positive/negative
  access; migrate generic strings to typed fields and relationships; define/operator-test
  dead-letter recovery and alerting; reconnect a browser and complete every menu,
  list, detail, edit-control, relationship and screenshot check.

No existing `vems-dev` or retained Stage 14 data or credentials were used or changed.
The only services stopped were started for this isolated audit. Issue #147 remains open.

## Issue #148 enforcement follow-up (24 September 2026)

The merged runner and retained `vems-audit-147` stack were reused for the
server-side enforcement follow-up. The original denied-write divergence was
reproduced before changes. The shared persistence boundary now rejects ordinary
mirror changes, including tested integration and administrator webservice writes
across all eight modules. The UI record model and bulk save path also reject the
vehicle-status change when invoked directly on the server. These are **not actual
browser UI tests**.

An explicitly authenticated worker operation passed canonical create/update and
outage replay with a stable remote ID. See the
[follow-up report](ISSUE_148_WRITE_ENFORCEMENT_2026-09-24.md) and
[live evidence](evidence/issue-148/enforcement.json). The original failed #147
evidence above is historical and remains preserved.

The ordinary administrator paths tested have no bypass. Administrators with
database/code/host control can bypass an application guard; universal enforcement
is not claimed. Browser access remains unavailable and the four intended manager
roles are still absent. **Both #147 and #148 remain open** until actual UI and
role checks pass. The follow-up retains audit volumes and all existing data;
`vems-dev` remains untouched.
