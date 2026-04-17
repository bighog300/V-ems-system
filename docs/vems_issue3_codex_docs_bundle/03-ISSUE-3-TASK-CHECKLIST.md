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

### Current blocker
- [x] Attempt dependency installation for non-shell runtime (`npm install -w @vems/orchestration better-sqlite3@^11.10.0`)
- [x] Confirm installation is blocked by registry policy (`403 Forbidden`)
- [x] Confirm `node:sqlite` unavailable in current runtime (`v20.19.6` => `ERR_UNKNOWN_BUILTIN_MODULE`)

## Test updates
- [ ] Add/adjust tests proving DB works without `sqlite3` CLI installed
- [ ] Add/adjust tests covering migrations/bootstrap path
- [ ] Ensure orchestration tests pass in current repo environment

## Docs
- [x] Update Issue 3 status docs with explicit implementation blocker details
- [ ] Update runtime docs to final closure state after non-shell DB runtime is actually implemented
