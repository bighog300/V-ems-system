# Codex Prompt — Phase 6

You are adding observability and production support readiness to the VEMS monorepo.

Focus files:
- `packages/shared/src/logging.mjs`
- `services/api-gateway/src/server.mjs`
- `services/orchestration/src/index.mjs`
- `services/orchestration/src/sync-worker*.mjs`
- diagnostics/logistics UI files
- docs for metrics, alerts, and runbooks

Goals:
1. consistent structured logging
2. useful support metrics
3. documented dashboards/alerts
4. actionable runbooks

Constraints:
- Do not add a heavyweight vendor-specific monitoring dependency unless the repo already expects it.
- Prefer artifacts and contracts that can be implemented by ops later if needed.
- Keep support endpoints secure and intentional.

Validate with:
```bash
npm run test -w @vems/api-gateway
npm run test -w @vems/orchestration
npm test
```
