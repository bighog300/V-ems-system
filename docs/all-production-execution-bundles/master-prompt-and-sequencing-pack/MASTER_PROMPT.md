# Master Prompt for Codex — Execute Bundles in Order

You are executing production hardening for the VEMS monorepo.

## Repo baseline
Active code is in:
- `services/api-gateway`
- `services/orchestration`
- `apps/web-control`
- `packages/shared`

Supporting scripts/config live in:
- `scripts/`
- `infra/`
- `env/`
- `.github/workflows/ci.yml`

Docs indicate the repo is at the end of Phase A functional core and needs Phase A completion, then Phase B deployability, then Phase C production hardening.

## Execution order
Execute these bundles in this exact order:
1. Phase 1 — Baseline Stabilization
2. Phase 2 — Reproducibility and Deployment
3. Phase 3 — Security and RBAC Hardening
4. Phase 4 — Integration and Sync Hardening
5. Phase 5 — Data, Database, Backup, and Recovery
6. Phase 6 — Observability, Alerting, and Runbooks
7. Phase 7 — Performance, Release, and Cutover

## Global rules
- Do not skip acceptance criteria.
- Do not expand scope into a platform rewrite.
- Keep the current monorepo structure.
- Prefer small, test-backed changes.
- Preserve API contracts unless a change is required and justified.
- At the end of each phase, provide:
  - changed files
  - tests run
  - results
  - blockers
  - unresolved follow-up items

## Required validation posture
After any substantive change, run the most relevant targeted tests first, then broader validation:
```bash
npm test
npm run init-db
npm run start:env
npm run smoke
npm run stop:env
```

## Definition of done
The repo is production-ready only when:
- core workflow is stable
- local/staging boot is reproducible
- security and RBAC are explicit
- sync/integration failures are diagnosable
- backup/restore works
- metrics/logs/runbooks exist
- load validation and release gates are defined
