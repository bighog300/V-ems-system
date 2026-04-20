# Codex Prompt — Phase 7

You are finalizing performance validation and release discipline for the VEMS monorepo.

Focus files:
- `scripts/load-test-api.mjs`
- `.github/workflows/ci.yml`
- smoke and health scripts
- docs for performance thresholds, release, rollback, and cutover

Goals:
1. measurable performance targets
2. usable load validation process
3. release gates that reflect true production readiness
4. written cutover and rollback process

Constraints:
- Keep this pragmatic and repo-native.
- Do not invent a large platform engineering stack.
- Build on the current scripts and CI.

Validate with:
```bash
npm test
npm run perf:load
```
