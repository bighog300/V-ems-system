# Phase 5 — Data, Database, Backup, and Recovery

## Objective
Turn current persistence from "functional" into "recoverable and supportable".

## Repo reality this bundle is based on
The repo already contains:
- SQLite runtime bridge in `services/orchestration/src/db.mjs`
- schema files in `services/orchestration/src/schema.sql` and migrations
- shell scripts `scripts/backup.sh` and `scripts/restore.sh`
- initialization through `scripts/init-db.sh`

Docs still list backup/recovery as unfinished production work. This bundle closes that gap.

## Exact scope
1. Make database runtime expectations explicit.
2. Ensure migrations/schema initialization are coherent.
3. Make backup/restore practical and verified.
4. Add recovery validation and operator instructions.
