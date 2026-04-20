# Codex Prompt — Phase 3

You are hardening VEMS-side vtiger retry, backoff, and idempotency behavior.

Focus files:
- `services/orchestration/src/sync-worker.mjs`
- `services/orchestration/src/sync-worker-service.mjs`
- `services/orchestration/src/repositories/sync-intent-repository.mjs`
- related migrations/tests
- diagnostics support code in the API gateway

Goals:
1. retry only what should be retried
2. dead-letter terminal failures cleanly
3. prevent duplicate vtiger mirrors
4. expose retry/dead-letter state in diagnostics

Constraints:
- Use the existing sync intent model.
- Do not build a second queueing framework.
- Prefer test-backed changes and explicit classifications.

Validate with:
```bash
npm run test -w @vems/orchestration
npm run test -w @vems/api-gateway
npm test
```
