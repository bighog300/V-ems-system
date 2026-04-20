# Task Breakdown

## A. Database runtime clarity
Inspect:
- `services/orchestration/src/db.mjs`
- `services/orchestration/src/schema.sql`
- migration files under `services/orchestration/src/migrations`
- `scripts/init-db.sh`

### Required changes
1. Clarify whether SQLite remains the supported production storage for this repo version or only dev/staging storage.
2. Ensure initialization uses the same schema source consistently.
3. Eliminate ambiguity around DB path/env resolution.

## B. Migration discipline
Required changes:
1. Ensure schema and migrations are not drifting silently.
2. Decide whether initialization should apply migrations or apply a canonical schema snapshot.
3. Document how future schema changes must be made.

## C. Backup and restore
Inspect:
- `scripts/backup.sh`
- `scripts/restore.sh`
- any env/dependency expectations

### Required changes
1. Make backup naming/location predictable.
2. Ensure restore has clear safeguards.
3. Add validation that restored DB boots the app correctly.
4. Document operational commands and caveats.

## D. Recovery validation
Create or document a recovery drill:
1. create data
2. back it up
3. replace or remove runtime DB
4. restore
5. run smoke / targeted reads to confirm recovered state
