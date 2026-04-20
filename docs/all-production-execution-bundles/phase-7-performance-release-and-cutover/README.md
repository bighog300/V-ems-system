# Phase 7 — Performance, Release, and Cutover

## Objective
Prove the system can be released in a controlled way and behaves acceptably under expected load.

## Repo reality this bundle is based on
The repo already contains:
- API load script `scripts/load-test-api.mjs`
- smoke and health checks
- CI workflow
- Docker-based environment startup
- a functioning incident creation path suitable for basic throughput testing

This phase turns those pieces into release discipline.

## Exact scope
1. Define performance expectations.
2. Run and document load/soak validation.
3. Improve release gating in CI/CD.
4. Produce a production cutover and rollback checklist.
