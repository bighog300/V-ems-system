# Phase 4 — Integration and Sync Hardening

## Objective
Make the existing upstream integration path resilient enough for deployable and supportable operation.

## Repo reality this bundle is based on
The repo already contains:
- sync worker runtime in `services/orchestration/src/sync-worker.mjs` and `sync-worker-service.mjs`
- connectivity and adapter validation scripts in `scripts/validate-*.mjs` and `test-adapter-connections.sh`
- adapter tests in orchestration
- support/metrics exposure in the API gateway
- logistics and diagnostics UI surfaces that already reference sync health

This phase should harden the already-existing shape instead of inventing a second integration architecture.

## Exact scope
1. Harden retry and error classification.
2. Make sync intent failures diagnosable.
3. Define degraded behavior when OpenEMR or Vtiger are unavailable.
4. Ensure support diagnostics reflect operational truth.
