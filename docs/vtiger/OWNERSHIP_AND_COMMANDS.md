# Vtiger operational ownership and command contract

Tracking: [management platform #146](https://github.com/bighog300/V-ems-system/issues/146)
and [ownership contract #148](https://github.com/bighog300/V-ems-system/issues/148).
This is the first implementation contract. The companion
`infra/services/vtiger/field-ownership.json` enumerates every field currently
listed in the development Vtiger module schema. `npm run test:vtiger-contract`
fails when a module or field is added without classification.

## Authority

| Domain | Authoritative write | Vtiger action today |
| --- | --- | --- |
| Incident intake, priority, status and closure | V-EMS API (`POST /api/incidents`, incident actions) | Display asynchronous HelpDesk mirror. No direct operational edit. |
| Assignment, crew and vehicle selection or reassignment | V-EMS API and guarded state transitions | Display assignment/crew mirrors. No direct operational edit. |
| Vehicle identity, callsign and service/operational status | V-EMS vehicle API | Display mirror. Maintenance must call V-EMS to change serviceability. |
| Personnel identity, role and availability | V-EMS personnel API | Display mirror. A Vtiger-only availability edit cannot change dispatch eligibility. |
| Stock item, vehicle loadout and usage | V-EMS stock APIs and clinical stock-usage path | Display catalog, holdings and consumption mirrors. Approval of a future replenishment request is not a stock increment. |
| Patient identity, encounter and ePCR | OpenEMR and V-EMS clinical APIs | No clinical detail in Vtiger. Keep only non-clinical operational references already approved for the incident mirror. |
| Future readiness, fault, maintenance and replenishment tasks | Not implemented as a complete lifecycle | Do not add editable operational controls until the authoritative command, RBAC and audit contract is implemented. |

The schema class `vems_mirror` means V-EMS owns the value and Vtiger receives
an asynchronous copy. `vtiger_metadata` means Vtiger generates or owns the
local record number, owner or timestamps. Classification alone is not permission
enforcement. The provisioner registers a vtlib event handler
(`VemsMirrorGuardHandler`, through `Vtiger_Event::register`) for
`vtiger.entity.beforesave.final` and `vtiger.entity.aftersave`. Vtiger core
files are not patched. The pinned `CRMEntity::save()` raises
`beforesave.final` before `saveentity()` persists anything. The handler reads
this registry and rejects ordinary saves that create, change or clear a
`vems_mirror` value. This covers UI record-model, `CRMEntity::save()` and
ordinary webservice saves. It does not depend on field visibility. Unchanged
mirror values and `vtiger_metadata` writes remain subject to normal Vtiger
permissions. An actual browser session confirmed this for a mouse-driven edit
and Save through the real Vtiger edit form, not only a server-side script; see
[browser-ui-2026-09-24.json](evidence/issue-147/browser-ui-2026-09-24.json).

The installer requires `data/CRMEntity.php` to match the SHA-256 hash of the
digest-pinned base image. That source defines the event ordering described
above. An earlier #148 build rewrote `saveentity()`. The installer removes that
rewrite and, if the result is not byte-for-byte identical to the pinned source,
provisioning fails. It also fails unless both handler registrations are
confirmed active.

For updates, the handler takes a MySQL advisory lock for the record in
`beforesave.final` and holds it until `aftersave`, which spans the comparison
and persistence of both ordinary and worker saves. This stops a stale ordinary
save from racing a worker change, even though the pinned distribution enables
autocommit. If the lock cannot be acquired, the save is denied. A denial releases
the lock immediately. A failed `saveentity()` raises no `aftersave` event, so a
shutdown hook releases any lock still held.

**Paths without save events.** Bulk-save mode (`$VTIGER_BULK_SAVE_MODE`, set by
UI Import) suppresses every non-core save handler. Direct `saveentity()` calls
and direct SQL also raise no events. The live audit confirmed that both
bulk-save mode and direct `saveentity()` bypass the guard (see the evidence
`bypasses`).

UI Import is the only user-facing route into bulk-save mode, and it is closed
for all users, administrators included:

- **Module-level override.** Vtiger's component loader prefers
  `modules/<Module>/views/Import.php` (`<Module>_Import_View`) over
  `Vtiger_Import_View`. Core Calendar and Users use the same mechanism. For each
  of the eight registry modules, the installer writes a generated override whose
  `checkPermission()` and `process()` both throw `LBL_PERMISSION_DENIED` for
  every user and mode. The shared code lives in `/opt/vems/ImportGuard.php`.
- **Why an override is needed.** `isPermitted()` always answers yes for
  administrators, so profile settings alone cannot deny them. As an extra layer,
  vtlib `disableTools` also removes Import from every profile, and the cached
  user privileges are regenerated.
- **Import link.** Administrators may still see the Import link, because link
  visibility uses `isPermitted()`. Following the link returns
  permission-denied. Confirmed through an actual browser session against the
  audit stack, not only a server-side script; see
  [browser-ui-2026-09-24.json](evidence/issue-147/browser-ui-2026-09-24.json).
- **Existing files.** The installer refuses to overwrite an `Import.php` it did
  not generate. Only HelpDesk is a core module, and the pinned distribution
  ships no `Import.php` override for it.
- **Queued imports.** The scheduled-import cron only processes imports queued
  through that view. Provisioning fails if `vtiger_import_queue` holds any
  unfinished import for a registry module.

`vemsMirrorWrite` refuses to run in bulk-save mode, because the event that
consumes its permit would not fire. In the pinned distribution, the only core
`saveentity()` caller outside `save()` is MailScanner, and it writes ModComments.

The guard has no administrator exemption. The isolated live administrator and
integration webservice probes are recorded in
`evidence/issue-148/enforcement.json`. Actual browser UI and intended manager-role
checks remain release gates under #147 and #148.

### Authenticated worker write path

Worker create/update calls use the POST webservice operation `vemsMirrorWrite`.
It requires a valid Vtiger session for the configured `VTIGER_USERNAME` **and**
an independent random `VTIGER_MIRROR_WRITE_KEY` of at least 32 characters.
Possession of an ordinary integration session/access key alone does not authorize
mirror changes. The operation restricts modules to the registry, checks update
ID/module agreement, delegates to Vtiger's normal permission checks, and grants
one record save only. Permission is consumed before persistence and cleared in
`finally`; nested saves do not inherit a blanket bypass. There is no fallback to
ordinary writes when the secret is missing or the operation fails.

Canonical commands, outbox correlation, stable-key lookup and supported replay
remain unchanged. Uncertain custom creates retain the existing reconciliation
semantics. Ordinary read clients continue to use normal webservices.

New Windows environments generate the separate key. The guarded audit runner
adds it once to its owned retained audit environment, preserving existing keys.
For another retained deployment, explicitly provision the same new random value
to the API worker and Vtiger environments before rebuilding/provisioning both;
an absent key fails worker writes closed. This work did not migrate `vems-dev`.
The installer is idempotent. It writes two one-line wrappers under the CRM
document root, because vtlib and the webservice dispatcher include only files
inside that root: `modules/VEMSVehicles/handlers/VemsMirrorGuard.php` and
`include/Webservices/VemsMirrorWrite.php`. Both wrappers load the guard from
`/opt/vems`. It also writes the generated `modules/<Module>/views/Import.php`
overrides, which load `/opt/vems/ImportGuard.php`. The installer registers the handler against the VEMSVehicles module
and guards all eight registry modules. Deploy the `/opt/vems` guard and registry
with the retained CRM volume. If you roll back only the container image and those
files are missing, the registered handler cannot load, and saves fail closed.

### Limits

This is an application save-event boundary. It does not protect against a
database administrator, a host or container administrator, or installed PHP code
that writes tables directly, calls `saveentity()`, enables bulk-save mode, or
deactivates the handler or removes the Import view override. Extensions that
persist records without `CRMEntity::save()` need separate review. No universal
administrator enforcement is claimed. The tested ordinary administrator
webservice, UI Import controller,
record-model and `save()` paths are denied.
Actual UI navigation, alternate UI actions and absent management accounts remain
unverified. Deletion and a complete management role matrix are separate work.

## Command requirements for a future Vtiger action

1. Authenticate a named user and use a scoped V-EMS command endpoint. Do not
   post directly into V-EMS tables or make Vtiger and OpenEMR call each other.
2. Send actor identity, an idempotency key, expected record version and a
   correlation ID. V-EMS enforces RBAC and state transitions, stores the audit
   event and returns the canonical record.
3. The V-EMS outbox mirrors the result back to Vtiger. The mirror update must
   not trigger another command. An uncertain response is reconciled by stable
   external key before retrying the write.
4. Show pending/failed sync state and the last confirmed V-EMS value. A local
   Vtiger field edit is never evidence that a crew-visible status changed.

Use V-EMS IDs as stable external keys and Vtiger IDs only as remote links.
Preserve UTC instants end to end and convert only for presentation. Do not
delete a V-EMS record because a Vtiger mirror is removed. Reconciliation must
report missing, duplicate, stale or locally edited records before any repair.

## Current write surfaces and gaps

`services/orchestration/src/index.mjs` creates and updates incidents,
assignments, vehicles, personnel and stock, then queues Vtiger sync intents.
`services/orchestration/src/sync-worker-service.mjs` drains those intents.
`apps/web-control/src/api.mjs` still lacks incident creation and assignment
calls; implement the dispatcher UI under Stage 17. The current Vtiger
provisioner installs mirror persistence enforcement but not a complete manager
role matrix or read-only UI controls. No general Vtiger-to-V-EMS command integration exists.

The baseline audit in `BASELINE_AUDIT.md` distinguishes source inspection from
live UI evidence. Do not mark issue #146's baseline or ownership acceptance
complete until the live role and edit checks there pass.
