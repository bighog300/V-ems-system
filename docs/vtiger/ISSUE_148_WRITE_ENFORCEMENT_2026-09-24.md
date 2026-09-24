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

The pinned Vtiger provisioner installs the registry-based guard at the start of
`CRMEntity::saveentity`, before its transaction and including saves that bypass
events. A dedicated POST `vemsMirrorWrite` operation requires both the configured
integration identity's authenticated Vtiger session and a separate random secret.
Its permission covers one save of the requested module/record, is consumed at
persistence and is cleared on return/error. Standard Vtiger permissions still
apply. The worker uses that operation for create/update, including replay, with
no ordinary-write fallback. Missing credentials fail closed. Uncertain creates
retain reconciliation behavior.

Final review found the pinned distribution disables its transaction wrappers.
The guard therefore holds a per-record MySQL advisory lock from comparison
through persistence for both worker and ordinary saves, releasing it in `finally`.
Lock acquisition failures deny the save. This closes the comparison/save race.

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
| Real UI record-model save, integration and administrator | Denied; vehicle unchanged |
| Direct bulk `saveentity`, integration and administrator | Denied; vehicle unchanged |
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

There is **no administrator exemption in the guard**, and the tested ordinary
administrator paths were denied. This is not universal enforcement: a database
or host administrator, or an administrator able to install/alter PHP, can bypass
the application boundary. Extensions writing tables directly require separate
review. Actual browser actions and the intended management roles remain an open
acceptance gate. Neither #148 nor #147 is closed by this work.

## Verification and corrections

- PHP guard tests cover all 115 classified fields, create/change/clear denial,
  allowed unchanged values/metadata, authentication rejection, one-save scope,
  lock acquisition/release and installer idempotence/source-drift rejection.
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
