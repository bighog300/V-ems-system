# Codex Prompt — Phase 2

You are hardening VEMS-side vtiger authentication and connectivity.

Focus files:
- `services/orchestration/src/adapters/transports.mjs`
- `scripts/validate-vtiger-connectivity.mjs`
- `scripts/validate-upstream-connectivity.mjs`
- `scripts/validate-connectivity.sh`
- env/docs files that define runtime variables

Goals:
1. explicit vtiger env/auth contract
2. real connectivity validation including auth
3. secret-safe behavior
4. clear dev vs staging/prod semantics

Constraints:
- Keep validation practical and scriptable.
- Do not print secrets in logs.
- Do not silently downgrade auth failures into generic availability failures.

Validate with:
```bash
./scripts/validate-connectivity.sh
node ./scripts/validate-vtiger-connectivity.mjs
npm test
```
