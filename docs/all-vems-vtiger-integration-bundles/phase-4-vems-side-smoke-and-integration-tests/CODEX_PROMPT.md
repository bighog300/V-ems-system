# Codex Prompt — Phase 4

You are implementing VEMS-side smoke and integration tests for vtiger.

Focus files:
- `scripts/smoke.sh`
- `scripts/smoke-test.mjs`
- `scripts/test-adapter-connections.sh`
- `scripts/validate-vtiger-connectivity.mjs`
- orchestration tests
- API gateway tests
- web-control diagnostics/logistics/supervisor tests

Goals:
1. separate core smoke from vtiger integration smoke
2. prove successful vtiger-bound sync behavior
3. prove vtiger failure classification behavior
4. verify diagnostics/UI rendering of vtiger issues

Constraints:
- Keep smoke practical for local and CI/staging usage.
- Do not make vtiger integration mandatory for every fast local test path unless explicitly configured.
- Prefer deterministic test doubles where a live vtiger is not needed.

Validate with:
```bash
npm test
npm run smoke
./scripts/test-adapter-connections.sh
```
