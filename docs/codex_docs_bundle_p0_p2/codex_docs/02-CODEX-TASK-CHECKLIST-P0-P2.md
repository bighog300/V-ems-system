# Codex Task Checklist — P0, P1, P2

Use this as the execution checklist. Mark each task complete only after code, tests, and docs are updated.

## P0

### P0.1 Frontend parsing fix
- [ ] Open `apps/web-control/src/diagnostics.mjs`
- [ ] Repair the malformed `upstream` ternary/object branch in `buildDiagnosticsSections()`
- [ ] Run the web-control tests
- [ ] Confirm diagnostics rendering output shape is unchanged except for the syntax fix

### P0.2 Replace `sqlite3` CLI dependency
- [ ] Inspect `services/orchestration/src/db.mjs`
- [ ] Identify every shell-out call to `sqlite3`
- [ ] Add a Node SQLite dependency to the correct workspace package
- [ ] Replace shell execution with direct library queries
- [ ] Preserve bootstrap/schema initialization
- [ ] Preserve current read/write behavior
- [ ] Update orchestration tests if needed
- [ ] Confirm tests pass without requiring a system-installed `sqlite3` binary

### P0.3 Path traversal fix
- [ ] Open `apps/web-control/src/server.mjs`
- [ ] Compute a canonical absolute root path
- [ ] Resolve request paths safely
- [ ] Reject any resolved path outside the root
- [ ] Preserve `/` => `index.html`
- [ ] Add or update tests to cover traversal attempts like encoded `..` segments

## P1

### P1.1 RBAC for read endpoints
- [ ] Enumerate current GET routes in `services/api-gateway/src/server.mjs`
- [ ] Add explicit RBAC rules for sensitive reads
- [ ] Keep policy roles consistent with existing route families
- [ ] Add negative tests for unauthorized access
- [ ] Add positive tests for allowed roles

### P1.2 Request body safety
- [ ] Add a JSON body size limit constant
- [ ] Enforce `application/json` on JSON write endpoints
- [ ] Return `415` for wrong content type
- [ ] Return `413` when payload exceeds the limit
- [ ] Preserve `400` for malformed JSON
- [ ] Add tests for all three failure modes

### P1.3 Collision-safe public IDs
- [ ] Find all `MAX(...) + 1` or equivalent public ID generation logic
- [ ] Replace with a collision-safe strategy
- [ ] Preserve public ID format if possible
- [ ] Ensure concurrent creation cannot duplicate IDs
- [ ] Update tests for ID generation behavior

## P2

### P2.1 README accuracy
- [ ] Rewrite `README.md` to match the actual repository
- [ ] State real prerequisites and startup commands
- [ ] Remove inaccurate claims about absent directories or infrastructure
- [ ] Document test and smoke commands that actually exist

### P2.2 Contributor/startup docs
- [ ] Update `START_HERE.md`
- [ ] Update `docs/README.md`
- [ ] Ensure document reading order still makes sense
- [ ] Add a brief note about current auth assumptions and local development expectations

## Validation gates
- [ ] Root `npm test` passes
- [ ] Any new package dependency installs correctly from lockfile/package manifests
- [ ] No required command assumes globally installed `sqlite3`
- [ ] Static traversal test passes
- [ ] RBAC read-route tests pass
- [ ] Payload safety tests pass
- [ ] Docs are internally consistent

## Final Codex response format
Codex should end with:
1. Summary of completed P0/P1/P2 items
2. Files changed
3. Commands run
4. Test results
5. Remaining follow-ups, if any
