# Issue #148 server-side mirror write enforcement

Base: merged #147 runner, main `e9e4c7b` (PR #159). All live work used the
retained `vems-audit-147` project and its existing credentials, SQLite database
and volumes. The previously stopped five audit services were started for this
work. `vems-dev` was not started, stopped, rebuilt or provisioned.

## Reproduction and implementation

Before installing enforcement, the original `denied-write` phase reproduced
`WRITE_ACCEPTED`, canonical `Available`, mirror `Out of Service`, divergence true.
See [reproduction](evidence/issue-148/baseline-reproduction.json); the original
#147 evidence is retained. The initial post-install repetition submitted the
same already-divergent value and was a no-op, not a valid negative test. The
final suite first repairs the mirror through a real canonical worker update,
then submits a different value and verifies rejection and unchanged state.

### Review-gate refactor: vtlib event handler, no core patch

The first revision of this PR rewrote `data/CRMEntity.php::saveentity()`, which
the [execution plan](../VEMS_VTIGER_MANAGEMENT_PLATFORM_EXECUTION_PLAN.md)
excludes. The guard now uses Vtiger's supported event path instead. The
provisioner calls `Vtiger_Event::register` to register `VemsMirrorGuardHandler`
for `vtiger.entity.beforesave.final` (lock and compare) and
`vtiger.entity.aftersave` (release). In the pinned distribution,
`CRMEntity::save()` raises `beforesave.final` immediately before `saveentity()`.
The handler therefore runs before persistence for UI record-model, mass/inline
edit, `CRMEntity::save()` and webservice create/update/revise.

The installer also does the following:

- Checks that `data/CRMEntity.php` matches the SHA-256 hash of the digest-pinned
  base image (`32ff1da7…`). That source defines the event ordering above.
- Removes the earlier revision's rewrite from retained CRM volumes. It fails
  unless the restored file is byte-for-byte identical to the pinned source.
- Fails unless it can confirm both active handler registrations.
  `Vtiger_Event::register` skips silently when its file-access check fails.
- Uses vtlib `disableTools` to remove Import from every profile for the eight
  registry modules, then calls `Vtiger_Access::syncSharingAccess` so the cached
  `user_privileges` files take effect.

The live audit confirmed that the retained `vems-audit-147` volume had its core
file restored to the pinned hash and contains no guard code.

**Bypasses.** Paths that raise no save events bypass the guard. Bulk-save mode
(`$VTIGER_BULK_SAVE_MODE`, set by UI Import) suppresses all non-core save
handlers. Direct `saveentity()` calls and direct SQL also raise no events. The
live probe performed both bypasses as administrator on a dedicated synthetic
vehicle. Both changed the mirror, and the canonical worker then repaired it to
`Available`. Import is denied to the integration account and still permitted to
administrators, because `isPermitted` returns yes for any administrator. In the
pinned distribution, the only core `saveentity()` caller outside `save()` is
MailScanner (ModComments). `vemsMirrorWrite` refuses to run in bulk-save mode.

### Mirror write operation

A dedicated POST `vemsMirrorWrite` operation requires both the configured
integration identity's authenticated Vtiger session and a separate random secret.
Its permission covers one save of the requested module/record, is consumed at
persistence and is cleared on return/error. Standard Vtiger permissions still
apply. The worker uses that operation for create/update, including replay, with
no ordinary-write fallback. Missing credentials fail closed. Uncertain creates
retain reconciliation behavior.

Final review found the pinned distribution disables its transaction wrappers.
For updates, the handler therefore takes a per-record MySQL advisory lock in
`beforesave.final` and holds it until `aftersave`. The lock covers comparison and
persistence for both worker and ordinary saves. If the lock cannot be acquired,
the save is denied. A denial releases the lock immediately. A failed
`saveentity()` raises no `aftersave` event, so a shutdown hook releases any lock
still held. This closes the race between comparison and save.

The audit runner added only the missing mirror key to its owned environment.
Existing credentials and all retained data were preserved. Other retained
deployments require an explicit key rollout; `vems-dev` was not migrated.

## Live results

[Sanitized live evidence](evidence/issue-148/enforcement.json) records:

| Check | Result |
| --- | --- |
| Integration ordinary webservice create/update, all eight modules | Denied; existing records/query results unchanged |
| Administrator ordinary webservice create/update, all eight modules | Denied; existing records/query results unchanged |
| Wrong worker secret, both available accounts | Denied |
| Correct worker secret with administrator identity | Denied |
| Integration vehicle operational-status divergence attempt | Denied; canonical and mirror remain Available |
| Handler installation | Core `CRMEntity.php` at pinned hash, no guard code; both handler events registered and active |
| Real UI record-model save, integration and administrator | Denied; vehicle unchanged |
| `CRMEntity::save()` (event path), integration and administrator | Denied; vehicle unchanged |
| UI Import permission | Integration denied; administrator permitted (known bypass) |
| Bulk-save mode save, administrator | **Bypass confirmed**; synthetic vehicle repaired by worker |
| Direct `saveentity()`, administrator | **Bypass confirmed**; synthetic vehicle repaired by worker |
| Actual browser UI/navigation/role interaction | NOT RUN: browser inventory empty; Chrome unavailable |
| Dispatcher, fleet manager, stock manager, supervisor | NOT RUN: these roles/accounts are absent |
| Canonical worker vehicle create and update | Passed |
| Audit-only Vtiger outage, supported replay, stable remote ID | Passed; failed intent replayed to succeeded |

The StockUsage module had no retained row, so the suite created one explicitly
labelled, non-clinical transport fixture through the authenticated mirror path.
It is retained as remote record `42x14`; no canonical clinical record was
created. Later runs reuse it, so their `transportFixtures` array lists no new
fixture. Synthetic vehicles from earlier suite attempts are also retained.
Repeated runs use unique vehicle IDs and preserve earlier data.

The event-handler run created synthetic vehicle `AMB-1481790248196822` for the
bypass probes. An earlier diagnostic run created `AMB-1481790248051946`. A direct
probe rerun also changed it, and a canonical worker update repaired it to
`Available`. Both vehicles are retained.

The guard has **no administrator exemption**, and the tested ordinary
administrator webservice, record-model and `save()` paths were denied. This is
not universal enforcement. The following can bypass the application event
boundary: UI Import by an administrator, which runs in bulk-save mode; direct
`saveentity()` or SQL; a database or host administrator; and anyone able to
install or alter PHP or deactivate handlers. Extensions that write tables
directly need separate review. Actual browser actions and the intended
management roles remain open acceptance gates. This work closes neither #148 nor
#147.

## Verification and corrections

- PHP guard tests cover:
  - all 115 classified fields, including create, change and clear denial
  - allowed unchanged values and metadata
  - authentication rejection and one-save permit scope
  - refusal of the worker operation in bulk-save mode
  - handler registration, activation and dispatch for the two save events
  - Import disablement and privilege regeneration
  - lock hold from `beforesave.final` to `aftersave`, release on denial and
    shutdown, and no lock for creates
  - byte-exact removal of both earlier core rewrites
  - rejection of drifted or unremovable core source and of unconfirmed
    registration
- Orchestration regression suite: 335 tests, 324 passed, 11 skipped, zero failed.
- Windows bootstrap, isolation and field-contract tests: 41 passed.
- Focused transport/mirror-operation tests: 29 passed.
- Root `npm run lint` on the existing Windows checkout failed on widespread
  pre-existing CRLF/trailing-whitespace reports and ignored local files. The
  unchanged linter passed on an isolated LF-normalized copy of the 240 current
  tracked/unignored JS/MJS/shell files in the audit API container's `/tmp`.
  No bulk checkout normalization was performed. `git diff --check` passed.
- Guard PHP tests are wired into CI alongside existing root tests.

During implementation, the worker initially failed because Vtiger's dispatcher
rejects an absolute handler path outside its document root. The installer now
registers an in-root wrapper that loads the guard. The corrected source was
rebuilt and provisioned through the retained audit runner; final tests did not
depend on the temporary diagnostic container copy. Earlier test requests also
exposed the API's vehicle-ID format and idempotency requirements and duplicate
PHP class loading in the test helper; these fixtures were corrected. Failed
attempts and synthetic records were not deleted.

## Reproduce

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/vtiger-audit.ps1 -Action Start
node scripts/windows/vtiger-audit-enforcement.mjs
Get-Content -Raw infra/services/vtiger/mirror-guard.test.php | docker exec -i vems-audit-147-vtiger-1 php
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/vtiger-audit.ps1 -Action Stop
```

The suite uses the merged isolation guard before work and for outage/recovery.
It recovers Vtiger in `finally`. Stop only audit services started for this work;
never use `down -v`, reset scripts or volume deletion. Final preservation and
shutdown status is recorded in `evidence/issue-148/shutdown.json`.
