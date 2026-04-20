# Task Breakdown

## A. Workspace reproducibility
Inspect:
- root `package.json`
- workspace package manifests:
  - `services/api-gateway/package.json`
  - `services/orchestration/package.json`
  - `apps/web-control/package.json`
  - `packages/shared/package.json`

### Required changes
1. Ensure all workspace dependencies resolve correctly from a clean checkout.
2. If `@vems/shared` resolution or workspace-local imports are fragile, fix package metadata/import strategy rather than relying on local state.
3. Confirm `npm ci` and `npm test` work from the repo root in a clean environment.

## B. Script and env consistency
Inspect:
- `scripts/lib.sh`
- `scripts/bootstrap.sh`
- `scripts/init-db.sh`
- `scripts/start-env.sh`
- `scripts/stop-env.sh`
- `scripts/health-check.sh`
- `scripts/smoke.sh`
- `env/*.env`
- `infra/.env*`

### Required changes
1. Document and enforce one source of truth for environment variables.
2. Ensure `start-env.sh` fails early and clearly for missing required values.
3. Ensure port defaults are consistent across scripts.
4. Ensure `.logs`, `.pids`, and `.data` creation is deterministic.
5. Ensure shutdown cleans up background processes cleanly.

## C. Docs consolidation
Update:
- `README.md`
- `START_HERE.md`
- optionally `docs/README.md`

### Required changes
1. Create one canonical local-start section.
2. Make it obvious when Docker is required and when it is not.
3. Remove or soften any claims that imply production-readiness before later phases are complete.
4. Add a troubleshooting section for:
   - npm workspace failures
   - env file missing
   - docker-compose unavailable
   - smoke failures
   - API health not ready

## D. CI hardening
Inspect:
- `.github/workflows/ci.yml`

### Required changes
1. Keep lint + tests.
2. Add script-level validation as appropriate:
   - smoke-oriented checks in a suitable environment
   - package/build verification where helpful
3. Make CI reflect the actual supported Node version and workspace behavior.
4. Avoid fake green CI that skips critical paths.
