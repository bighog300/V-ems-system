# Codex Prompt — Phase 3

You are hardening security in the VEMS monorepo.

Focus on the API gateway first.

Files to inspect and modify:
- `services/api-gateway/src/server.mjs`
- `services/api-gateway/src/auth.mjs`
- `services/api-gateway/src/authorization-policy.mjs`
- `services/api-gateway/test/production-readiness-foundations.test.mjs`
- CI workflow if needed
- docs for auth mode clarification

Goals:
1. Explicit route protection for critical endpoints
2. Safe separation of dev and production auth behavior
3. Hardened runtime defaults
4. Security-related tests proving the posture

Constraints:
- Do not rip out the current local header-context test model unless you replace it with an equally testable mechanism.
- Preserve local developer productivity.
- Prefer explicit environment-gated behavior over hidden assumptions.

Validate with:
```bash
npm run test -w @vems/api-gateway
npm test
```
