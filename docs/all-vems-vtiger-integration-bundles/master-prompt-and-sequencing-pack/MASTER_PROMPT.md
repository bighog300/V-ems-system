# Master Prompt — VEMS↔vtiger Integration Bundles

You are executing the VEMS-side integration hardening for vtiger CRM.

## Active VEMS repo areas
- `services/orchestration`
- `services/api-gateway`
- `apps/web-control`
- `scripts/`
- `env/`
- `docs/`

## Execute these phases in order
1. Phase 1 — Contracts and Adapter Shape
2. Phase 2 — Auth, Connectivity, and Secrets
3. Phase 3 — Retries, Backoff, and Idempotency
4. Phase 4 — VEMS-side Smoke and Integration Tests
5. Phase 5 — Cutover, Operations, and Joint Readiness

## Global rules
- Do not skip acceptance criteria.
- Keep the current monorepo structure.
- Prefer explicit contracts and test-backed changes.
- Preserve the existing sync worker architecture.
- Make diagnostics and operator visibility better, not noisier.
- At the end of each phase, report:
  - changed files
  - tests run
  - results
  - blockers
  - unresolved follow-up items

## Definition of done
The VEMS side is vtiger-ready only when:
- contracts are explicit
- auth/connectivity are validated
- retry/dead-letter behavior is intentional
- integration smoke proves real behavior
- diagnostics clearly surface vtiger issues
- cutover/runbooks exist
