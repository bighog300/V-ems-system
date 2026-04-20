# Codex Prompt — Phase 4

You are hardening integration and sync behavior in the VEMS monorepo.

Focus files:
- `services/orchestration/src/sync-worker*.mjs`
- adapter client and payload-mapper files under `services/orchestration/src`
- orchestration sync tests
- connectivity scripts under `scripts/`
- diagnostics/logistics UI files under `apps/web-control/src`
- support routes in `services/api-gateway/src/server.mjs`

Goals:
1. bounded retries
2. visible terminal failures
3. clear degraded-mode behavior
4. diagnostics that support operators

Constraints:
- Preserve the current architecture and SQLite-backed orchestration core.
- Do not add a new queueing platform unless absolutely unavoidable.
- Prefer test-backed changes.

Validate with:
```bash
npm run test -w @vems/orchestration
npm run test -w @vems/api-gateway
npm test
```
