# Isolated Windows Vtiger desktop audit

Use this procedure for issue #147 while an existing development stack is retained.
Do not run the ordinary development bootstrap, stop, or reset scripts for an audit.
Run from the Windows repository root with Docker Desktop in Linux-container mode.

## Fixed isolation boundary

The PowerShell entry point accepts only an action; it cannot accept a project,
Compose file, environment path, or arbitrary Docker arguments. It never reads the
existing development environment. Its Node runner resolves Compose configuration
in memory, validates it, and prints only an allowlisted resource summary.

| Resource | Audit value |
| --- | --- |
| Project | `vems-audit-147` |
| Runtime | `%LOCALAPPDATA%\VEMS-Audit\issue-147` (current-user ACL) |
| Credentials | `audit.env` within that runtime; newly generated on first start |
| SQLite | `data\audit-147.sqlite` within that runtime |
| API / Vtiger / OpenEMR | `127.0.0.1:13001` / `127.0.0.1:18080` / `127.0.0.1:18083` |
| MySQL / Redis | `127.0.0.1:13307` / `127.0.0.1:16380` |
| Named volumes / network | All prefixed `vems-audit-147_` |
| Built image tags | `vems-audit-147/{api,vtiger,openemr}:desktop` |

Docker Compose must support `!override`. The overlay
replaces port mappings rather than appending to development bindings. The API
still listens on container port 3001. OpenEMR certificate volumes are explicitly
named so its image cannot silently create untracked anonymous certificate data.

An ownership marker binds the runtime to the Docker context. First start rejects
pre-existing matching resources or unowned runtime data. Later actions check the
resolved topology and existing audit-container mounts before mutation. A lock
prevents overlapping runner operations. Port collisions fail without stopping
any owner. Failures retain partial resources and credentials for investigation;
never remove volumes or reset to obtain a passing result.

## Commands

```powershell
node --test scripts/windows/vtiger-audit.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\test-development.ps1 -StaticOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Inspect
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Validate
```

Start builds only audit image tags, starts dependencies, provisions newly generated
integration identities, starts the API and embedded worker, seeds synthetic crew,
and runs service validation. Repeated starts retain the audit data and credentials.
No host npm install is required: the API image installs its locked dependencies.
Inspect is read-only. Validate performs the existing non-mutating service checks
inside the audit API container (where port 3001 refers to that container).

Once start succeeds, the guarded evidence helper can run:

```powershell
node scripts/windows/vtiger-audit-live.mjs roles
node scripts/windows/vtiger-ui-check.mjs <label>   # five-account List/Detail/Import gate over Vtiger's real login
node scripts/windows/vtiger-link-crawl.mjs <label>   # read-only GET crawl per account: dead links, PHP errors, edit/create form availability
node scripts/windows/vtiger-audit-live.mjs guard-create-delete   # worker create ok; ordinary creates and all deletes denied (leaves one disposable synthetic vehicle)
node scripts/windows/vtiger-audit-live.mjs describe
node scripts/windows/vtiger-audit-live.mjs seed
node scripts/windows/vtiger-audit-live.mjs snapshot
node scripts/windows/vtiger-audit-live.mjs relationships
node scripts/windows/vtiger-audit-live.mjs denied-write
```

The seed creates synthetic personnel, a vehicle, stock item and restock, incident
and assignment through V-EMS with fixed audit idempotency keys. It creates no
patient data. `describe` captures field metadata, compares both source registries,
and queries each module without exporting record payloads. `snapshot` reads the
audit SQLite file with a read-only connection inside the audit API container;
it does not run migrations or a second worker. `denied-write` deliberately tries
to change only the synthetic vehicle's mirrored status and compares canonical
state. An accepted write or divergence is a defect, not a passing denied-write test.
Evidence JSON is written under `docs/vtiger/evidence/issue-147`; inspect before committing.

Inspect the actual UI at `http://127.0.0.1:18080` with audit-only accounts. Never
use saved development credentials. Follow all eight module and five role checks
in BASELINE_AUDIT.md. Missing roles are findings; do not invent permissions and
report them as the baseline. Redact test identifiers in screenshots. A successful
webservice test does not count as a UI, navigation, or edit-control test.

## Outage, recovery and shutdown

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Outage
node scripts/windows/vtiger-audit-live.mjs outage-update
node scripts/windows/vtiger-audit-live.mjs snapshot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Recover
node scripts/windows/vtiger-audit-live.mjs recovery
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\vtiger-audit.ps1 -Action Stop
```

Outage and Recover address only the audit Vtiger service. Record timestamps and
retain separate snapshots before/after each phase. Worker retries are bounded;
recovery is not proven until canonical/mirror state, remote IDs, intents and audit
IDs agree. A dead letter requires an explicit supported replay/reconciliation
step and must be reported. The guarded `node scripts/windows/vtiger-audit-live.mjs replay`
command invokes the supported replay API for dead-lettered audit outage intents only;
then rerun `recovery`. Preserve the pre-replay file before rerunning it. Stop selects only verified audit container IDs and
retains all volumes and the external runtime directory. It does not run `down`,
`reset-development.ps1`, volume removal, or a Docker-wide stop.
