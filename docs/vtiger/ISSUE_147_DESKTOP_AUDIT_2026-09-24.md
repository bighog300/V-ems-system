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
reproduced before changes. A vtlib `vtiger.entity.beforesave.final` handler now
rejects ordinary mirror changes. It needs no Vtiger core patch. It denied the
tested integration and administrator webservice writes across all eight modules.
Invoked directly on the server, the UI record model and `CRMEntity::save()` also
reject the vehicle-status change. These are **not actual browser UI tests**.
Bulk-save mode and direct `saveentity()` calls raise no events and are confirmed
server-side bypasses. UI Import, the user-facing route into bulk-save mode, is
now denied for all users, administrators included. A module-level Import view
override on each of the eight modules does this.

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

## Browser UI and manager-role continuation (24 September 2026, later)

This section supersedes "Browser access remains unavailable" above. The built-in
browser pane of the Claude Code desktop app reached the retained
`vems-audit-147` Vtiger instance directly (`http://127.0.0.1:18080`). This is
the first actual, interactive browser UI evidence gathered for #147 or #148;
every prior attempt recorded browser access as unavailable.

**Blocking discovery.** Before any account could open a module's List view, the
page was a fatal PHP error for every account, administrator included:
`CustomView::getViewId()` resolves the default view by querying
`vtiger_customview` for `viewname='All'`, and vtlib's module creation never
inserts that row. `provision-development.php` now creates one, matching the
exact shape of a standard module's shipped "All" view. This is baseline List
functionality, not the saved-filter/column/menu design #151 owns, and it
applies to `vems-dev` too, not only the audit stack.

**Manager roles.** `provision-audit-roles.php` (new, audit-only; not part of
`provision-development.php` or `vems-dev`) provisions the four previously-MISSING
roles/profiles/accounts: Dispatcher, Fleet Manager, Stock Manager, Supervisor.
Each profile grants global view-all/export-all and denies edit-all and every
per-module action and field, so read access comes from "view all" rather than a
hand-built per-module matrix; #151 still owns that matrix and the associated
menu/filter design. Credentials are generated the same way as the audit's other
secrets, stored only in the owned `audit.env`, and never printed.

**Live results**, detailed in
[browser-ui-2026-09-24.json](evidence/issue-147/browser-ui-2026-09-24.json) and
[roles.json](evidence/issue-147/roles.json):

| Role | Sign in | List/detail view | Denied mirrored-state write |
| --- | --- | --- | --- |
| Dispatcher | PASS | PASS (real data; no edit control) | N/A (no edit control offered) |
| Fleet manager | PASS | PASS | N/A (no edit control offered) |
| Stock manager | PASS | PASS | N/A (no edit control offered) |
| Supervisor | PASS | PASS | N/A (no edit control offered) |
| Integration user | PASS | PASS (edit control present) | Not attempted here; see #148 evidence |
| Administrator | PASS | PASS | **DENIED**, first actual-browser-UI proof |

For the administrator, an actual mouse-driven edit-and-save of
`vems_operational_status` on the synthetic vehicle was submitted through the
real Vtiger edit form. It returned `{"success":false,"error":{"code":"V-EMS
mirrored fields require the authenticated mirror write operation"}}`, and the
record was confirmed unchanged on reload. Navigating the administrator directly
to the VEMSVehicles Import view returned "Permission denied". Both are the
actual-browser-UI evidence the #148 review gate asked for; every earlier #148
result was a server-side script invocation, not a browser click.

**Residual findings**, not fixed here and out of this audit's scope:

- Every custom module's List view renders rows with blank column text (no
  `vtiger_cvcolumnlist` entries exist for the generated default view; the
  built-in HelpDesk module, which ships its own columns, renders correctly).
  Confirmed for the administrator too, not just the new roles. This is #151's
  saved-filter/column-configuration work.
- Several pages emit non-fatal PHP warnings ("Undefined array key ...") for
  accounts whose profile does not explicitly grant every action/utility id a
  page happens to check. `provision-audit-roles.php` denies every id
  `Vtiger_Action_Model::getAll(true)` returns, which removed most but not all
  instances; the pages still render correct data and correct denials underneath.

**Still not run:** a walkthrough of the remaining six modules beyond confirming
the default-view fix resolves them; related-list navigation between linked
records; a full per-module, per-account write-attempt matrix through the UI
(one representative administrator denial was captured instead); and file
screenshots (page-text captures were used in the evidence bundle instead).

This is real progress against the #147/#148 acceptance gate, not closure of it.
Both issues remain open pending #151's role/list design and a broader UI
walkthrough. Only the audit-owned services were used; `vems-dev` and its data
were not started, stopped, or changed by this continuation.

## Evidence-gathering continuation (25 September 2026)

Started from SHA `5f80ab976084697e21ea6495c51fc44194440435` with a clean working tree.
The audit runner's Start, Inspect and Validate actions all exited 0 (isolation verified,
service validation passed). `vems-dev` containers were stopped before this session and
were not started, reset or modified; all audit volumes are retained.

**Webservice matrix (new, PASS).** `node scripts/windows/vtiger-audit-live.mjs ws-matrix`
runs [vtiger-audit-ws-matrix.php](../../scripts/windows/vtiger-audit-ws-matrix.php) inside the audit
Vtiger container (access keys read in-process, never emitted) and records
[ws-matrix.json](evidence/issue-147/ws-matrix.json). Results, all six accounts:

| Account | Login | describe + query, 8 modules | Vehicle mirrored-status update | Mirror after / canonical |
| --- | --- | --- | --- | --- |
| Administrator | PASS | ALLOWED 8/8 | DENIED (#148 mirror guard) | Available / Available |
| Integration user | PASS | ALLOWED 8/8 | DENIED (#148 mirror guard) | Available / Available |
| Dispatcher | PASS | ALLOWED 8/8 (updateable=false) | DENIED | Available / Available |
| Fleet Manager | PASS | ALLOWED 8/8 (updateable=false) | DENIED | Available / Available |
| Stock Manager | PASS | ALLOWED 8/8 (updateable=false) | DENIED | Available / Available |
| Supervisor | PASS | ALLOWED 8/8 (updateable=false) | DENIED | Available / Available |

This supersedes the historical "vehicle update ACCEPTED" integration-user result above:
the divergence no longer reproduces. Finding: the four manager accounts are denied with
the misleading message "Permission to read given object is denied" on an update; the
denial is correct but the message is a webservice permission-layer wording defect (#151).

**Browser walkthrough: NOT RUN in this session.** The built-in browser reached
`http://127.0.0.1:18080` (login page shown, title "vtiger") but every role requires a
password sign-in, which the assistant may not perform. The earlier
[browser-ui-2026-09-24.json](evidence/issue-147/browser-ui-2026-09-24.json) evidence stands;
its gaps (six-module walkthrough, related-list navigation, edit-control matrix for every
role, saved screenshots) remain open. #147 is **not** closed.

## Real-browser role walkthrough (25 September 2026)

Started from SHA `ae51f7c8b26fe9193e269d77846d2b079810b9c5` on `main`. The `vems-audit-147` stack was
already running and healthy, so it was not started by this session and was not stopped. The
`vems-dev-*` containers stayed exited; no audit volume was touched. Each account was signed in by a human
typing the password in the browser pane; credentials were never read, printed or logged. Role identity
was confirmed from the page's `_USERMETA.userlabel` after each sign-in. Full row-level results:
[ui-results-table-2026-09-25.md](evidence/issue-147/ui-results-table-2026-09-25.md) (also `.csv`).
Screenshots: [screenshots/](evidence/issue-147/screenshots/) (60 real desktop captures cropped to the
browser pane; 5 were removed, see above). Repo `.gitignore` excluded `screenshots/`; a narrow exception for this folder was added.

### Results by role

All five roles (Dispatcher, Fleet Manager, Stock Manager, Supervisor, Integration user) can open List
and Detail for all eight modules, and all 40 direct Import navigations (5 roles x 8 modules) return
"Permission denied" with no upload form. 35 of the 40 have a screenshot in the repo; the other 5 (Fleet Manager Import denial for AssignmentCrew, Personnel, StockItems, Vehicles and VehicleStock) were removed because the captures also showed an unrelated window, and are to be re-captured. The four manager roles
have no edit control on any module. The Integration user has an edit control on all eight.

| Check | Result |
| --- | --- |
| Menu | All eight modules appear under the Support app for every role tested |
| Import denial, 5 roles x 8 modules | PASS, screenshots for all 40 |
| Manager roles: no edit control | PASS (data check on all eight Detail pages per role) |
| Integration user synthetic vehicle write via real edit form | DENIED by the #148 guard; see below |

### Synthetic write test (Integration user, VEMSVehicles AMB-147, record 4)

In the real Vtiger edit form `vems_operational_status` was changed from `Available` to `Out of Service`
and Save was clicked (attempted twice: the first screenshot pair was unusable, so it was repeated). Vtiger
returned raw JSON `{"success":false,"error":{"code":"V-EMS mirrored fields require the authenticated mirror
write operation"...}}`. The record was unchanged on reload.

| State | Canonical V-EMS (API) | Vtiger mirror (id 37x4) |
| --- | --- | --- |
| Before ([ui-write-before.json](evidence/issue-147/ui-write-before.json), 14:34:11Z) | Available | Available |
| After ([ui-write-after.json](evidence/issue-147/ui-write-after.json), 14:40:05Z) | Available | Available |

No divergence. This is the first actual-browser confirmation that the Integration user's UI edit path is
closed for mirrored fields. Limitation: the desktop capture of the raw-JSON result page came out blank, so
the denial is evidenced by the captured page text rather than an image; the edit form (showing the typed
value) and the unchanged detail page after the save have screenshots.

### FAIL findings for #150/#151 (documented, not fixed here)

1. **Blank list columns.** All seven VEMS List views render a row with no column headers and blank
   cells (HelpDesk renders correctly). Screenshot: `dispatcher_VEMSAssignments_list.png` and one per module.
2. **Plain-text reference fields.** `incident_ref`, `vehicle_ref`, `assignment_ref`, `personnel_ref`,
   `stock_item_ref` show remote IDs such as `17x7`/`37x4` as text; 0 linked reference fields on any Detail page.
   Screenshot: `dispatcher_VEMSAssignments_detail.png`.
3. **No related lists.** Neither HelpDesk nor the VEMS modules have related tabs, so incident -> assignment ->
   vehicle/crew and vehicle -> stock cannot be followed by clicking; the requested relationship chain
   was not navigable in the UI.
4. **PHP warnings rendered on pages.** `Undefined array key "DETAILVIEWBASIC"` is visible on every VEMS Detail
   page for every role. HelpDesk Detail shows `DETAILVIEWBASIC`, `DOCUMENT_WIDGET_MODEL` and `Attempt to read
   property "value" on null` for the four manager roles (not for Integration user). A further UserInfoUtil.php
   line 410 warning is visible for the Integration user. Screenshots: `dispatcher_HelpDesk_detail.png`,
   `dispatcher_VEMSAssignments_detail.png`, `integration_VEMSVehicles_detail-after-denied-save.png`.
5. **Other UX defects seen:** untranslated `LBL_VEMS_INFORMATION` and `SINGLE_VEMSVehicles` labels; raw
   module class names used as menu labels; a broken `vtiger-crm-logo.png` image in the header;
   `vems_operational_status` is a free-text box, not a picklist; the mirror-guard denial is shown as a raw
   JSON page; managers can see the generic Sales/Marketing/Inventory apps; a newly signed-in manager account
   lands on Vtiger's "Almost there!" preferences dialog (Stock Manager; left untouched).
6. **Dead navigation.** No dead link was found: all module menu links and the eight module URLs loaded
   (HTTP 200). This was not a crawl of every link on every page, so it is not claimed as exhaustive.

### Acceptance-gate status after this run

| Gate item | Status | Basis |
| --- | --- | --- |
| Five-role sign-in and Import denial, all eight modules | PASS | 35 Import-denial screenshots (5 removed, to be re-captured) + fetch results for all 40 |
| Read access for each role to all eight modules | PASS | real browser, all roles |
| Managers offered no edit control | PASS | Detail page check, no image per module |
| Integration user UI write blocked; mirror vs canonical equal | PASS | text capture, two data snapshots, before/after screenshots |
| Administrator Import + edit denial | PASS | earlier run: browser-ui-2026-09-24.json |
| Webservice role matrix; outage and manual replay | PASS | earlier runs (not repeated) |
| Related-list navigation incident -> assignment -> vehicle/crew, vehicle -> stock | FAIL | relationships absent (#151) |
| Typed reference fields / usable list columns | FAIL | #150 / #151 |
| No PHP warnings on rendered pages | FAIL | #151 |
| Full per-module edit-control matrix (edit form opened per module per role) | NOT RUN | only VEMSVehicles edit form exercised |
| Exhaustive dead-link crawl | NOT RUN | |
| Automatic recovery after dead-lettering | FAIL | earlier run; unchanged |

`node --test scripts/windows/vtiger-audit.test.mjs`: 20 passed. `vtiger-audit.ps1 -Action Validate`: exit 0,
"Non-mutating adapter validation passed." #147 is **not** closed: related-list navigation, list columns,
reference typing and PHP warnings still FAIL, and the per-module edit-form matrix was not run.

## Final real-browser run after the fixes (25 September 2026, evening)

Run on `main` at `981dd00`, after the list-column and warning fixes (#163), native references (#164) and related
lists (#165). The audit stack was already running and was not stopped; `vems-dev-*` stayed exited and all 13 named
volumes are retained. Each account was signed in by a human typing the password in the browser pane, and
identity was confirmed from the page's `_USERMETA.userlabel`. Row-level results:
[ui-final-results-2026-09-25.md](evidence/issue-147/ui-final-results-2026-09-25.md) (also `.csv`). Screenshots:
[screenshots/final-2026-09-25/](evidence/issue-147/screenshots/final-2026-09-25/) (34 full-resolution crops of the pane).

**What was checked.** The Dispatcher followed the whole relationship chain by real clicks with a screenshot at
every hop: incident -> Assignments tab -> assignment -> vehicle -> Vehicle Stock tab -> stock line -> stock item,
and assignment -> Assignment Crew tab -> crew record -> person, plus a List view for each of the seven VEMS modules.
Fleet Manager, Stock Manager and Supervisor each re-checked representative pages; Fleet Manager re-captured the five
Import denials removed earlier. The Integration user repeated the edit-form write test with a real screenshot at
every step. The automated gate (`vtiger-ui-check`) passed again at the end
([ui-check-final-run-2026-09-25.json](evidence/issue-147/ui-check-final-run-2026-09-25.json)).

**Synthetic write test (Integration user, VEMSVehicles AMB-147).** In the real edit form Operational Status was
changed from `Available` to `Out of Service` and Save was clicked. Vtiger returned the #148 denial
(`V-EMS mirrored fields require the authenticated mirror write operation`, shown as a raw JSON page), and the record
was unchanged on reload.

| State | Canonical V-EMS | Vtiger mirror (37x4) |
| --- | --- | --- |
| Before, 16:44:23Z ([ui-write-before-final.json](evidence/issue-147/ui-write-before-final.json)) | Available | Available |
| After, 16:45:11Z ([ui-write-after-final.json](evidence/issue-147/ui-write-after-final.json)) | Available | Available |

### The four FAIL findings, re-checked in a real browser

| Finding | Before | Now |
| --- | --- | --- |
| Blank list columns | Blank rows, no headers on all 7 VEMS lists | PASS: headers and populated cells on all 7 (screenshots `dispatcher_12` to `18`) |
| Plain-text reference fields | `17x7`, `37x4` as text | PASS: Incident, Vehicle, Assignment, Personnel and Stock Item references are blue links (`dispatcher_04`, `07`, `10`) |
| No related lists | Chain could not be followed | PASS: chain followed by real clicks (`dispatcher_01` to `11`) |
| PHP warnings rendered | `DETAILVIEWBASIC` on every Detail page, three warnings on HelpDesk | PASS: none on any page visited, including the read-only roles (`supervisor_02`) |

### Acceptance-gate status

| Gate item | Status | Basis |
| --- | --- | --- |
| Five-role sign-in | PASS | Each account signed in and identity confirmed |
| Import denied, 5 roles x 8 modules | PASS | 40 screenshots in the repo (earlier set plus this run's replacements) |
| Relationship chain followed by clicking | PASS for Dispatcher (12 screenshots); other roles by the automated gate (12/12 hops) and spot checks, not clicked through | Screenshots + gate JSON |
| Integration user UI write blocked; mirror equals canonical | PASS | Form, denied result and unchanged record screenshots plus before/after state |
| Four FAIL findings fixed | PASS | Table above |
| Managers offered no edit control | PASS | No Edit button in the Dispatcher and Fleet Manager pages; gate checks all 32 role/module pairs |
| Edit form opened for every module for every role | NOT RUN | Only VEMSVehicles for the Integration user |
| UI create attempt by the Integration user | NOT RUN | The VEMSVehicles page shows an "Add Record" button for this role; a create through it was not attempted, so it is not known whether the #148 guard refuses it |
| Exhaustive dead-link crawl | NOT RUN | No dead link seen in the menu or visited pages |
| Automatic recovery after dead-lettering | FAIL | Earlier finding, unchanged and unrelated to this run |

### Notes and remaining findings (not fixed here)

- Two screenshots (`stock-manager_01`, `supervisor_01`) were removed because they also showed the desktop; both pages
  were checked in the browser and are recorded in the results table as page checks without an image.
- The five Fleet Manager Import screenshots removed by the credentials incident (see the earlier section) are
  re-captured in this run.
- UX: related tabs render as two-letter badges (`As`, `Ve`) with a tooltip; the left menu shows initials (two `AS`
  icons for Assignments and Assignment Crew); related-list panels show only External Key and Assigned To;
  Operational Status is a free-text box; the denied save shows a raw JSON page; the header logo image is broken.
- The first attempt at this run was blocked because a credentials file was open on screen and overlapped the capture
  area. The capture script now refuses to run while a window with a credentials-like title exists.
- Earlier screenshots were captured at 80% of the display because of 125% scaling; this run captures the full
  1920x1080 screen and crops to the pane.

#147 is **not** closed by this run. Three items above remain NOT RUN, and two of them (per-module edit forms and a UI
create attempt) bear directly on the write-authority question.

## UI create, edit and delete test as the Integration user (25 September 2026)

Follow-up to the earlier "UI create attempt: NOT RUN" gate item, after the Vehicles list showed an **Add Record**
button and the record page showed **Delete Vehicle** and **Duplicate** for the Integration user. Run in the real
Vtiger UI against the audit stack with synthetic data only; the person signed in was confirmed as
`VEMS Development Integration`. State was read from Vtiger (webservice query) and canonical V-EMS (API) before
and after every step ([ui-create-state-*.json](evidence/issue-147/)). Screenshots:
[ui-create-2026-09-25/](evidence/issue-147/screenshots/ui-create-2026-09-25/).

| Step | Action in the real UI | Result | Vtiger vehicles | Canonical vehicles |
| --- | --- | --- | --- | --- |
| Before | none | n/a | 11 | 11 |
| A | Add Record; fill vehicle ID, external key, callsign, status, service status and type (`AMB-UI-CREATE`); Save | **DENIED**: `V-EMS mirrored fields require the authenticated mirror write operation` | 11 | 11 |
| B | Add Record; leave every mirror field blank, owner only; Save | **CREATED**: a blank vehicle record (`37x33`) exists in Vtiger with no V-EMS counterpart | **12** | 11 |
| C | Edit the blank record, type a callsign, Save | **DENIED** (same guard error) | 12 | 11 |
| D | More > Delete Vehicle > Yes on the blank record | **DELETED**: back to 11 in the active list (a Vtiger delete goes to the Recycle Bin) | 11 | 11 |

### Findings (not fixed here)

1. **FAIL: the #148 guard does not stop a UI create with blank mirror fields.** `MirrorGuard::assertSave` compares
   each mirror-owned field to its stored value, which is `''` on a create, and denies only when a value differs. A
   create with every mirror field blank therefore passes, and the Integration user can add orphan records to the
   mirror (a blank external key, no canonical counterpart) through the ordinary UI. It cannot fill them in
   afterwards (step C is denied), so this is record pollution rather than value divergence, but it is a write path
   into a mirror that is meant to be written only by the V-EMS worker.
2. **FAIL: delete is not guarded.** The Integration user could delete a Vtiger record through the UI (step D). The
   guard hooks saves only. Deleting a **real** mirrored record was deliberately not tried; it would remove that
   record's mirror while its canonical record remains. Whether the worker then recreates it, and whether the remote ID
   stays stable, is unknown.
3. **Not tested: Duplicate.** The record page offers it for this role. It copies mirrored values, so the guard
   should refuse it, but that is unverified.
4. The Vehicles list shows Add Record and the record page shows Edit, Delete and Duplicate to a role that the design
   says must not write mirrored data; the guard is the only control, and the UI advertises actions it then refuses.

Suggested follow-up (not implemented): deny every create and delete outside the authenticated mirror operation
regardless of field values, and remove Add Record, Delete and Duplicate from these modules' action permissions so the
UI stops offering them.

### Gate status update

| Gate item | Status | Basis |
| --- | --- | --- |
| UI create attempt by the Integration user | **FAIL** (was NOT RUN) | Steps A to D above |
| Edit with values on a mirrored record | PASS (denied) | Earlier run and step C |
| Delete by the Integration user | **FAIL** | Step D, on a synthetic orphan only |
| Duplicate by the Integration user | NOT RUN | Offered, not attempted |
| Delete of a real mirrored record | NOT RUN | Deliberately not attempted |
| Edit form opened on every module for every role | NOT RUN | Unchanged |
| Exhaustive dead-link crawl | NOT RUN | Unchanged |

#147 stays **open**, and the write-authority question is answered: the mirror is protected against value changes but
not against blank-record creation or deletion.
