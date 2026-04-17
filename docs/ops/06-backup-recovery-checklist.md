# Backup and Recovery — Operator Checklist

## What is backed up

The platform persists all operational state in a single SQLite database file.
The path is controlled by the `VEMS_DB_PATH` environment variable (default:
`.data/platform.<env>.sqlite`).

**Covered by backup:**
- All incidents, calls, and status history
- Assignment records
- Patient link records
- Encounter link records (encounter IDs, handover metadata, closure state)
- Sync intent queue (pending, failed, dead-lettered)
- Event outbox
- Idempotency keys
- Audit log entries

**Not covered / out of scope:**
- Vtiger CRM data (source of truth lives in Vtiger)
- OpenEMR clinical data (source of truth lives in OpenEMR)
- In-flight process state (PIDs, `.logs/`, `.pids/` directories)
- Environment configuration files (`env/*.env`)

---

## Backup storage

Backups are written to `.backups/` in the repository root by default.
Override with the `VEMS_BACKUP_DIR` environment variable.

Backup filenames follow the pattern:
```
platform-<env>-<YYYYMMDDTHHMMSSZ>.sqlite
```

---

## Pre-backup checklist

- [ ] Confirm which environment you are backing up (`development`, `production`, etc.)
- [ ] Confirm `VEMS_DB_PATH` points to the correct database file
- [ ] Confirm `.backups/` directory is on a volume with sufficient free space
- [ ] Note the current time for log correlation

---

## Running a backup

```bash
./scripts/backup.sh [environment]
# e.g.:
./scripts/backup.sh production
```

The script will:
1. Load environment variables from `env/<environment>.env`
2. Verify the database file exists
3. Create a timestamped backup using SQLite's `.backup` command (hot backup — no downtime required)
4. Print the backup file path and size

Optional: set `BACKUP_RETAIN_DAYS` to automatically prune old backups.

---

## Post-backup verification

- [ ] Confirm the backup file exists at the printed path
- [ ] Run `sqlite3 <backup-file> "PRAGMA integrity_check;"` — expect output `ok`
- [ ] Record the backup filename and timestamp in your ops log
- [ ] Verify backup file size is plausible (not zero or unexpectedly small)

Example verification:
```bash
sqlite3 .backups/platform-production-20260417T120000Z.sqlite "PRAGMA integrity_check;"
# Expected: ok
```

---

## Restore checklist

**Before restoring:**
- [ ] Stop all platform services: `./scripts/stop-env.sh`
- [ ] Confirm no processes hold the database file open: `lsof <db-path>`
- [ ] Identify the correct backup file to restore from
- [ ] Ensure you have the correct `env/<environment>.env` loaded

**Running a restore:**
```bash
./scripts/restore.sh <backup-file> [environment]
# e.g.:
./scripts/restore.sh .backups/platform-production-20260417T120000Z.sqlite production
```

The script will:
1. Verify backup file integrity before touching anything
2. Create an automatic pre-restore safety backup of the current database
3. Restore from the specified backup file
4. Verify integrity of the restored database

**After restoring:**
- [ ] Confirm the restore script reported `Restore complete and integrity verified`
- [ ] Run `sqlite3 <db-path> "PRAGMA integrity_check;"` independently
- [ ] Restart platform services: `./scripts/start-env.sh [environment]`
- [ ] Check service logs for startup errors: `tail -f .logs/api-gateway.log`
- [ ] Run the smoke test suite: `./scripts/smoke.sh [environment]`
- [ ] Verify the `/api/support/readiness` endpoint returns `production_readiness.structured_logging: true`

---

## Incident response — common failure scenarios

### Scenario 1: Database file corrupted or missing

1. Stop all services: `./scripts/stop-env.sh`
2. Identify most recent valid backup in `.backups/`
3. Run integrity check on candidate backup: `sqlite3 <file> "PRAGMA integrity_check;"`
4. Restore: `./scripts/restore.sh <backup-file> [environment]`
5. Restart and smoke: `./scripts/start-env.sh && ./scripts/smoke.sh`

### Scenario 2: Restore script fails integrity check

The backup file itself may be corrupted. Try the next most recent backup.
The current live database is untouched until the pre-restore safety backup step completes.

### Scenario 3: Pre-restore safety backup fails (disk full)

Free disk space, then re-run the restore script. The live database was not
modified.

### Scenario 4: Post-restore integrity check fails

The restore process will print an error and exit. Your pre-restore safety
backup (named `<db>-pre-restore-<timestamp>.sqlite`) is preserved. Contact
the on-call engineer before proceeding.

### Scenario 5: Sync intents are behind after restore

After restoring to an older snapshot, sync intents that were processed after
the snapshot point will be in an unknown state in Vtiger/OpenEMR. Review the
audit log and re-queue affected intents if necessary. Vtiger is the system of
record for operational data — reconcile against Vtiger state.

---

## Known limitations

- **Hot backup with in-flight writes**: SQLite's `.backup` command is safe
  under concurrent writes but may capture an in-flight transaction. Always
  verify with `PRAGMA integrity_check` after backup.
- **No point-in-time recovery**: Backups are full snapshots. There is no WAL
  replay capability at this time.
- **Vtiger/OpenEMR data not included**: If the platform DB is restored to a
  point before certain Vtiger/OpenEMR records were created, sync intents may
  attempt to re-create records that already exist. The platform's idempotency
  key mechanism mitigates duplicate creation for most operations.
- **No automated scheduling**: Backup scheduling is not automated. Operators
  must trigger backups manually or via a cron job.
