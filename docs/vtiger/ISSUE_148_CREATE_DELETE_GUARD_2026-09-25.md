# #148 follow-up: deny every create and delete outside the mirror operation

Recorded 25 September 2026. The UI create/edit/delete test for the Integration user (PR 168) found two gaps in the
#148 mirror guard: a create with every mirror-owned field blank was accepted and left an orphan record with no V-EMS
counterpart, and deletes were not guarded at all. This change closes both. It does not change update behaviour.

## Behaviour

| Path | Before | After |
| --- | --- | --- |
| Create outside the mirror operation, blank mirror fields | **Allowed** (orphan record) | **Denied** |
| Create outside the mirror operation, with values | Denied | Denied |
| Create through the worker (`vemsMirrorWrite`, mode create) | Allowed | Allowed |
| Update changing a mirror-owned field | Denied | Denied |
| Delete, UI single or mass delete, or webservice `delete` | **Allowed** | **Denied**, for every account including administrators |
| Duplicate (a create) | Denied only when values were copied | Denied |

The worker has no delete operation (there is none in the mapper or sync worker) and `vemsMirrorWrite` only accepts
`create` and `update`, so denying every delete costs the worker nothing. All eight modules have `write_authority: vems`,
so one rule covers them; HelpDesk is included, and an ordinary ticket create is denied
([evidence](evidence/issue-148-followup/helpdesk-ordinary-create.json)).

## Change

- `MirrorGuard::assertSave`: after the permit check, a save with no record id is denied. The worker's permit is
  stored as `[module, null]` for a create, so it is unaffected and still honoured once, for its own module only.
- `MirrorGuard::beforeDelete` and `MirrorGuardHandler`: a new handler for `vtiger.entity.beforedelete`, which the pinned
  `CRMEntity::trash()` raises (checked in the shipped source), denies any delete of a mirrored module.
- `install-mirror-guard.php`: registers the third event and now requires three confirmed handler rows.
- `field-ownership.json`: states `ordinary_creates` and `deletes` as denied.
- `vtiger-audit-live.mjs` phase `guard-create-delete` plus `vtiger-audit-guard-delete.php`: a repeatable live check.

Deliberately **not** done: hiding Add Record, Delete and Duplicate by removing those actions from the Integration
user's profile. The worker creates and updates as that user, and Vtiger's webservice checks the profile first, so
removing the permissions would break the worker. The guard is the enforcement; the buttons remain visible to the
Integration service account and administrators only (the four manager roles never see them). Hiding them is left for a
separate change.

## Evidence (audit stack, after a real `vtiger-audit.ps1 -Action Start`)

Handlers registered: `beforesave.final`, `aftersave` and `beforedelete`, all active.

[guard-create-delete.json](evidence/issue-148-followup/guard-create-delete.json), using a disposable synthetic vehicle:

| Check | Result |
| --- | --- |
| Worker create (V-EMS API to worker to Vtiger) | **Still works**: mirrored as `37x34`, vehicles 11 to 12 |
| Ordinary webservice create, every mirror field blank | **DENIED**, count stays 12 |
| Ordinary webservice create, with values | **DENIED**, count stays 12 |
| `vtws_delete` of the worker-created record as the Integration user | **DENIED**: `V-EMS mirrored fields require the authenticated mirror write operation (mirrored records cannot be deleted)` |
| Same as the administrator | **DENIED**; the record is still present and not deleted |
| Worker update afterwards | **Still works**, same remote ID |

Regression: the automated UI gate passes again (0 failures, [ui-check-after-guard-fix.json](evidence/issue-148-followup/ui-check-after-guard-fix.json));
`ws-matrix` is unchanged (96 allowed, 12 denied); the six relationship comparisons still hold.

Tests: `mirror-guard.test.php` (CI's exact step, run here in `php:8.3-cli`) went from 115 to 131 checks. The new
tests were written first and failed against the old guard: blank create denied for every mirrored module; a creating
permit honoured once and only for its module and only for a create; delete denied for every mirrored module both
directly and through the vtlib event; unmirrored modules unaffected; the installer registers and confirms three events.
The Node tests (36) pass.

## Limits

- **Real-browser re-run not done.** Steps B (blank create) and D (delete) from the browser test should be repeated
  with the Integration user signed in; that needs a human sign-in. The webservice and `vtws_delete` paths are proven
  live, and the UI uses the same save and delete events, but the UI itself is not re-tested.
- **Recycle Bin permanent delete and restore** use raw SQL or `restore()` and raise no save or delete event. They can only
  act on records already marked deleted, and no mirrored record can now be marked deleted, so the residual is the
  orphan record removed during the browser test, which is still in the Recycle Bin and could be restored or purged.
- **Bulk-save mode, direct `saveentity()` and SQL callers** raise no events, as before (UI Import is denied separately).
- **Anyone with database or host access** can still bypass any application guard.
- **Duplicate** is denied by the create rule but was not exercised live through the UI.
- **Cleanup is now database-only.** A synthetic mirrored record can no longer be removed through Vtiger; this run left
  the disposable vehicle `AMB-359214570` (remote ID `37x34`) on the audit stack.
- Applies to `vems-dev` on its next provisioning run (not touched).
