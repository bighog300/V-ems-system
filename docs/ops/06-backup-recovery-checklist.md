# Backup and Recovery — Operator Checklist

For the full coordinated-recovery procedure (restore order across all four
targets, and the post-restore linkage consistency check between V-EMS and
Vtiger/OpenEMR), see `docs/ops/07-disaster-recovery-runbook.md`. This page
is the quick command reference.

## Supported backup targets

VEMS has four backup targets that must all be covered in production:
1. **V-EMS's own database** — SQLite file at `VEMS_DB_PATH`, or Postgres
   when `VEMS_DB_DRIVER=postgres` (Stage 12 milestone 12b).
2. **V-EMS's encrypted object storage** — attachments at
   `VEMS_OBJECT_STORAGE_DIR` (Stage 12 milestone 12c). The backup archives
   already-encrypted bytes; `VEMS_OBJECT_STORAGE_KEY` itself must be backed
   up separately, through the deployment's secret store, never bundled with
   the data — see `docs/ops/security-compliance.md`.
3. **Vtiger's MySQL schema**.
4. **OpenEMR's MySQL schema**.

## Backup commands

### V-EMS database snapshot (SQLite or Postgres, auto-selected)
```bash
./scripts/backup.sh <environment> db
```

### V-EMS object storage snapshot
```bash
./scripts/backup.sh <environment> object-storage
```

### Both of the above in one run
```bash
./scripts/backup.sh <environment> all
```

### Vtiger / OpenEMR MySQL logical dump
Set `DB_ENGINE=mysql` plus that system's own `DB_NAME`/`DB_USER`/
`DB_PASSWORD`, and run the same script:
```bash
DB_ENGINE=mysql DB_NAME=vtiger DB_USER=... DB_PASSWORD=... ./scripts/backup.sh <environment> db
DB_ENGINE=mysql DB_NAME=openemr DB_USER=... DB_PASSWORD=... ./scripts/backup.sh <environment> db
```

## Restore commands

```bash
./scripts/restore.sh <backup-file> <environment> db               # SQLite, Postgres, or MySQL per DB_ENGINE/VEMS_DB_DRIVER
./scripts/restore.sh <backup-file> <environment> object-storage   # V-EMS attachments
```

The restore script validates:
- SQLite integrity (`PRAGMA integrity_check`).
- Postgres/MySQL accessibility (`SELECT 1`).
- Object storage: the archive extracted with its `objects/` directory intact
  (per-object decrypt+checksum integrity is verified lazily by `getObject()`
  at read time, since that needs `VEMS_OBJECT_STORAGE_KEY`).

An existing object-storage directory is moved aside (not deleted) before a
restore overwrites it, so a bad restore can be rolled back manually.

## Post-restore validation

See `docs/ops/07-disaster-recovery-runbook.md` for the full sequence,
including the linkage consistency check between V-EMS's `sync_intents` and
Vtiger/OpenEMR's actual restored state. Quick reference:

- `./scripts/health-check.sh`
- `node scripts/validate-upstream-connectivity.mjs`
- `./scripts/smoke.sh <environment>`
- `curl -fsS http://localhost:3000/api/support/readiness`

## Backup cadence and ownership

- **Daily**: scheduled backups of all four targets by Platform Ops.
- **Weekly**: full restore drill (all four targets, in the runbook's
  recovery order) to a non-production environment, including the linkage
  consistency check.
- **Monthly**: signed review of backup success/failure log and the latest
  drill's outcome by Engineering Manager.
