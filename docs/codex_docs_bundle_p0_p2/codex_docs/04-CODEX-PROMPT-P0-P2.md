# Ready-to-paste Codex Prompt — P0, P1, P2

Use the following prompt in Codex.

---

You are working inside the VEMS monorepo. Implement the fixes described below directly in the repository. Do not ask for confirmation. Make the smallest high-confidence code changes that fully resolve the scoped issues, update tests, and update docs.

## Goal
Fix P0, P1, and P2 issues in this repo.

## P0
1. Fix the syntax error in `apps/web-control/src/diagnostics.mjs` inside `buildDiagnosticsSections()`.
2. Replace the `sqlite3` CLI shell-out implementation in `services/orchestration/src/db.mjs` with a Node SQLite runtime dependency so tests pass without requiring a system `sqlite3` binary.
3. Fix path traversal risk in `apps/web-control/src/server.mjs` by resolving paths safely and rejecting anything outside the intended root.

## P1
4. Add explicit RBAC protection for sensitive read endpoints in `services/api-gateway/src/server.mjs`, including these if present:
   - `GET /api/incidents`
   - `GET /api/incidents/:id`
   - `GET /api/incidents/:id/patient-link`
   - `GET /api/incidents/:id/encounters`
   - `GET /api/encounters/:id/interventions`
   - `GET /api/encounters/:id/handover`
5. Add request body protections in `services/api-gateway/src/server.mjs`:
   - reject wrong content type with `415`,
   - reject oversized JSON bodies with `413`,
   - preserve `400` for malformed JSON,
   - preserve the existing error envelope style.
6. Replace race-prone `MAX(...) + 1` public ID generation with a collision-safe approach while preserving current public ID formats where practical.

## P2
7. Update `README.md`, `START_HERE.md`, and `docs/README.md` so they match the real repository, commands, and prerequisites.

## Constraints
- Keep changes tightly scoped.
- Do not redesign product workflows or state machines.
- Do not introduce unrelated refactors.
- Preserve existing API shapes unless a scoped fix requires a change.
- Prefer minimal, maintainable code.

## Validation
You must run the relevant tests and finish only when root `npm test` passes.

## Output format
At the end, provide:
1. Summary of fixes by priority
2. Files changed
3. Commands run
4. Test results
5. Remaining follow-ups, if any

---
