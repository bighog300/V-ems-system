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
local record number, owner or timestamps. Neither class is permission
enforcement: the current provisioner creates generic fields and does not make
the Vtiger UI read-only. Disabling direct edits and testing a manager account
are separate gates before the management UI is released.

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
provisioner creates fields but not a complete manager role matrix or
read-only controls. No general Vtiger-to-V-EMS command integration exists.

The baseline audit in `BASELINE_AUDIT.md` distinguishes source inspection from
live UI evidence. Do not mark issue #146's baseline or ownership acceptance
complete until the live role and edit checks there pass.
