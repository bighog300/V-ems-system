# Issue 3 Execution Brief

## Objective
Remove the remaining `sqlite3` CLI fallback and replace it with a true non-shell DB runtime path.

## In-scope files
Primary:
- `services/orchestration/src/db.mjs`

Likely related:
- `services/orchestration/src/migrations/*`
- `services/orchestration/src/repositories/*`
- `services/orchestration/test/db-runtime.test.mjs`
- `services/orchestration/test/*`
- `scripts/backup.sh`
- `scripts/restore.sh`
- docs mentioning DB runtime requirements

## Required outcome
Implement one of these acceptable closure paths:

### Preferred path A
Use a real embedded/runtime database implementation that works on the repo's supported Node version and does not shell out.

### Acceptable path B
Move orchestration persistence fully to the production DB engine already supported by the repo, if that results in no shell-out DB runtime and remains testable in-repo.

## Hard constraints
- Do not keep any runtime path that shells out to `sqlite3`
- Do not reintroduce Python DB bridging
- Preserve existing repository interfaces where practical
- Keep domain logic unchanged
- Keep migrations working
- Update tests and docs
- End only when repo tests pass

## Notes
If a Node-version-specific embedded module cannot be relied on in the current environment, prefer a solution that is deterministic in the current runtime rather than a conditional fallback that keeps the issue open.
