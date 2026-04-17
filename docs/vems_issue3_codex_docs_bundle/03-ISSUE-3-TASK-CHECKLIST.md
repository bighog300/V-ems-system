# Issue 3 Task Checklist

## Investigation
- [x] Inspect `services/orchestration/src/db.mjs`
- [x] Identify every remaining `sqlite3` CLI invocation path
- [x] Identify assumptions in migrations/repositories/tests tied to the current DB implementation

## Implementation
- [ ] Remove all `sqlite3` CLI shell-out behavior
- [ ] Replace it with a non-shell runtime DB approach
- [ ] Preserve `queryAll`, `queryOne`, `execute`, transaction, and migration behavior as needed
- [ ] Keep startup/bootstrap behavior working
- [ ] Update backup/restore behavior if DB runtime choice changes operational expectations

## Test updates
- [ ] Add/adjust tests proving DB works without `sqlite3` CLI installed
- [ ] Add/adjust tests covering migrations/bootstrap path
- [ ] Ensure orchestration tests pass in current repo environment

## Docs
- [ ] Update any docs that mention DB runtime prerequisites
- [ ] Remove stale references to `sqlite3` CLI if present
