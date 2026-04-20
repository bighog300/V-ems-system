# Codex Prompt — Phase 5

You are hardening persistence and recovery in the VEMS monorepo.

Focus files:
- `services/orchestration/src/db.mjs`
- `services/orchestration/src/schema.sql`
- `services/orchestration/src/migrations/*`
- `scripts/init-db.sh`
- `scripts/backup.sh`
- `scripts/restore.sh`
- root/docs runtime notes if needed

Goals:
1. Explicit database runtime expectations
2. Clean schema/migration discipline
3. Verified backup and restore
4. Written recovery drill

Constraints:
- Preserve the existing orchestration persistence model unless a focused improvement is needed.
- Do not introduce a totally different database stack in this phase.

Validate with:
```bash
npm run init-db
npm test
./scripts/backup.sh
./scripts/restore.sh <backup-artifact-if-required>
npm run start:env
npm run smoke
```
