# Codex Prompt — Phase 1

You are defining the VEMS-side vtiger integration contract.

Focus files:
- `services/orchestration/src/adapters/transports.mjs`
- `services/orchestration/src/sync-worker.mjs`
- `services/orchestration/src/sync-worker-service.mjs`
- `services/orchestration/src/repositories/sync-intent-repository.mjs`
- `services/api-gateway/src/server.mjs`
- diagnostics/logistics UI files
- docs/specs files you add

Goals:
1. explicit contract for vtiger-bound operations
2. normalized transport result/error model
3. stable sync-intent payload expectations
4. diagnostics-ready metadata

Constraints:
- Keep the current operation names unless there is a very strong reason to rename them.
- Prefer additive documentation and normalization over architecture changes.
- Preserve compatibility with the existing sync worker flow.

Validate by:
- running current orchestration and API tests
- adding/adjusting contract tests where needed
