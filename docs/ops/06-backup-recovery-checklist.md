# Backup and Recovery — Operator Checklist

## Supported backup targets

VEMS has two backup targets that must both be covered in production:
1. **Orchestration runtime DB** (SQLite file at `VEMS_DB_PATH`).
2. **Containerized service DBs** (MySQL schemas for OpenEMR and Vtiger).

## Backup commands

### Orchestration DB snapshot
```bash
./scripts/backup.sh <environment>
```

### MySQL logical dump
Set `DB_ENGINE=mysql` in the environment and run:
```bash
./scripts/backup.sh <environment>
```

## Restore commands

```bash
./scripts/restore.sh <backup-file> <environment>
```

The restore script now validates:
- SQLite integrity (`PRAGMA integrity_check`).
- MySQL accessibility (`SELECT 1`).

## Post-restore validation

- `./scripts/health-check.sh`
- `./scripts/smoke.sh <environment>`
- `curl -fsS http://localhost:3000/api/support/readiness`

## Backup cadence and ownership

- **Daily**: scheduled backups by Platform Ops.
- **Weekly**: restore drill to non-production environment.
- **Monthly**: signed review of backup success/failure log by Engineering Manager.
