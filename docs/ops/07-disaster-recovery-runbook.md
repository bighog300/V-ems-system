# Disaster Recovery Runbook (Stage 12 milestone 12g)

This runbook covers coordinated recovery of the full V-EMS platform, not just
one database in isolation. V-EMS's own state (Postgres/SQLite + encrypted
object storage) is only half the picture: every incident and ePCR also
carries **linkage state** to Vtiger (operational/CRM record) and OpenEMR
(clinical record) via `sync_intents` (`services/orchestration/src/migrations/
001_initial_schema.sql`, extended by `003_vtiger_incident_integration.sql`).
Restoring V-EMS's database to an earlier point without accounting for
Vtiger/OpenEMR's own state — or vice versa — leaves that linkage state wrong:
records V-EMS thinks are un-synced that already exist upstream, or records
V-EMS thinks are synced that don't.

## Backup targets

Four independent things must be backed up for a full recovery:

| Target | Script | Notes |
|---|---|---|
| V-EMS's own database (SQLite or Postgres, per `VEMS_DB_DRIVER`) | `./scripts/backup.sh <env> db` | Selects sqlite/postgres automatically from the loaded environment. |
| V-EMS's encrypted object storage (attachments) | `./scripts/backup.sh <env> object-storage` | Archives already-encrypted bytes; see "Object-storage key" below. |
| Vtiger's MySQL schema | `DB_ENGINE=mysql DB_NAME=vtiger DB_USER=... DB_PASSWORD=... ./scripts/backup.sh <env> db` | Reuses the same script's MySQL branch with Vtiger's own credentials. |
| OpenEMR's MySQL schema | `DB_ENGINE=mysql DB_NAME=openemr DB_USER=... DB_PASSWORD=... ./scripts/backup.sh <env> db` | Same, with OpenEMR's credentials. |

`./scripts/backup.sh <env> all` backs up V-EMS's own database and object
storage together in one run (it does not reach into the Vtiger/OpenEMR
containers — those are backed up with their own `DB_ENGINE=mysql` invocations
above, since they're independent MySQL schemas with their own credentials).

### Object-storage key

The object-storage backup archives already-encrypted bytes — it is not a
second encryption layer, and it does **not** include `VEMS_OBJECT_STORAGE_KEY`
itself. A restored archive is unreadable without that key. Keep the key
backed up separately, through the deployment's own secret store (never
committed, never bundled with the data it protects) — see
`docs/ops/security-compliance.md`'s "Key rotation" section. Losing the key
without a separate copy makes every archived object permanently
unrecoverable; this is the single most important thing to get right about
this backup target.

## Recovery order

Restore in this order. Each step depends on the state the previous one left,
so it isn't arbitrary:

1. **Vtiger and OpenEMR MySQL schemas** (`./scripts/restore.sh <backup-file>
   <env> db` with the matching `DB_ENGINE=mysql` credentials). These have no
   dependency on V-EMS, so restoring them first establishes a known-good
   baseline for step 3's linkage validation.
2. **V-EMS's own database** (`./scripts/restore.sh <backup-file> <env> db`).
   Restoring this after Vtiger/OpenEMR means the `sync_intents` rows that
   come back are compared against the upstream systems' *actual* restored
   state in step 3, not a state that's about to change out from under them.
3. **V-EMS's object storage** (`./scripts/restore.sh <backup-file> <env>
   object-storage`). Restored last because ePCR/attachment records in the
   just-restored V-EMS database reference object-storage keys by checksum —
   restoring the database first, then the objects it references, means any
   mismatch (a referenced object missing from the archive) is immediately
   visible rather than masked by restoring in the other order.

Restoring V-EMS's own database from a backup taken *before* Vtiger/OpenEMR's
restore point (or after it) is the actual disaster-recovery case this order
doesn't fully solve by itself — see "Linkage consistency check" below, which
catches exactly that.

## Post-restore validation

Run in order; each is a hard gate; stop and escalate rather than proceeding
past a failure to the next step:

1. **Service health**: `./scripts/health-check.sh`
2. **Upstream connectivity**: `node scripts/validate-vtiger-connectivity.mjs`
   and `node scripts/validate-openemr-connectivity.mjs` (or
   `node scripts/validate-upstream-connectivity.mjs` for both).
3. **Application smoke test**: `./scripts/smoke.sh <environment>`
4. **Readiness endpoint**: `curl -fsS http://localhost:3000/api/support/readiness`
5. **Linkage consistency check** (the step specific to a coordinated
   restore, not a single-database restore): for a sample of incidents/ePCRs
   modified around the backup's timestamp, compare each `sync_intents` row's
   `status`/`target_system`/`entity_type` against whether the corresponding
   Vtiger ticket or OpenEMR encounter actually exists post-restore:
   - A `sync_intents` row marked `succeeded` whose target record is
     **missing** upstream (Vtiger/OpenEMR restored to an earlier point than
     V-EMS) means that record needs to be re-synced — flip it back to
     `pending` so the sync worker replays it, rather than leaving it silently
     unsynced.
   - A `sync_intents` row marked `pending`/`failed` whose target record
     **already exists** upstream (Vtiger/OpenEMR restored to a later point
     than V-EMS, or the record synced after V-EMS's backup but before the
     incident) risks a duplicate on replay — verify by the upstream record's
     own idempotency key before letting the sync worker retry it; do not
     just clear the intent, since that hides a real gap.
   - The `services/api-gateway`'s `/api/support/diagnostics` endpoint's
     `sync_intent_summary.failed_intents` view is the fastest way to see
     failed/dead-lettered intents post-restore.

## Backup cadence, retention, and ownership

- **Daily**: automated backup of all four targets (`./scripts/backup.sh
  <env> all`, plus the two `DB_ENGINE=mysql` invocations for Vtiger/OpenEMR)
  by Platform Ops, timestamped so all four can be correlated to the nearest
  backup window for the recovery-order procedure above.
- **Weekly**: full restore drill (all four targets, in the order above) into
  a non-production environment, including the linkage consistency check —
  not just confirming the restore command exits 0.
- **Monthly**: signed review of backup success/failure logs and the most
  recent drill's outcome by the Engineering Manager.
- **RPO/RTO targets**: recovery point objective of 24 hours (daily backup
  cadence), recovery time objective of 4 hours for a full four-target
  restore plus validation, driven primarily by the weekly drill's measured
  timing rather than an estimate.

## Incident-time procedure

1. **Assess scope**: which of the four targets are actually lost/corrupted?
   A single-target incident (e.g. object storage only) only needs that
   target's restore step and the validation steps relevant to it (skip
   Vtiger/OpenEMR connectivity checks if they were never touched).
2. **Restore** the affected targets in the order above (a partial incident
   still follows the same relative order among the targets it touches).
3. **Validate** per the post-restore checklist above; do not declare
   recovery complete before the linkage consistency check passes.
4. **Record** the incident, the backup(s) used, and the linkage check's
   findings (which `sync_intents` rows were corrected and why) per
   `docs/ops/security-compliance.md`'s incident response runbook — a DR
   event is a security/compliance-relevant incident, not just an ops one,
   because it can affect PHI availability and cross-system record integrity.
