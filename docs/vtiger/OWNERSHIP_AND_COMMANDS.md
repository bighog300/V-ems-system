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
enforcement. The provisioned server now reads this registry at the shared
`CRMEntity::saveentity` boundary, before its database transaction, and rejects
ordinary saves that create, change or clear a `vems_mirror` value. This applies
to UI record-model, ordinary webservice and bulk saves through that boundary;
it does not depend on field visibility. Unchanged mirror values and
`vtiger_metadata` writes remain subject to normal Vtiger permissions.
The guard holds a MySQL advisory lock across comparison and persistence for
both ordinary and worker saves of a record. This prevents stale ordinary saves
from racing worker changes even though the pinned distribution enables autocommit.
Lock acquisition failure denies the save; a `finally` block releases the lock.

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
The installer adds a checked, idempotent hook to the pinned Vtiger distribution
and refuses unexpected save-function source. Deploy the `/opt/vems` guard and
registry with the retained CRM volume; rolling back only the container image
without those files would leave the retained hook unable to load.

### Limits

This is an application persistence boundary, not protection against a database
administrator, host/container administrator, or installed PHP code that writes
tables directly or removes the guard. Specialized extension paths that bypass
`CRMEntity::saveentity` require separate review. A privileged user who can change
server configuration/code can bypass it; no universal administrator enforcement
is claimed. The tested ordinary administrator webservice path is denied.
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
