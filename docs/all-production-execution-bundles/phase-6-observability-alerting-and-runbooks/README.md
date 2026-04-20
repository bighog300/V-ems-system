# Phase 6 — Observability, Alerting, and Runbooks

## Objective
Give operators enough visibility to detect, understand, and respond to failures in the VEMS stack.

## Repo reality this bundle is based on
The repo already contains:
- shared logging helpers in `packages/shared/src/logging.mjs`
- support metrics route in the API gateway
- diagnostics and logistics UI surfaces
- health checks and smoke scripts
- some production-readiness tests already referencing support metrics

This phase should organize and extend those foundations rather than bolt on an unrelated monitoring stack.

## Exact scope
1. Standardize structured logs across critical paths.
2. Define a useful metrics surface.
3. Add dashboards/alert definitions or at minimum machine-readable metric contracts.
4. Write practical runbooks for common failures.
