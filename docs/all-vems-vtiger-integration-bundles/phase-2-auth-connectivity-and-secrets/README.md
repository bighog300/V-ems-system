# Phase 2 — VEMS↔vtiger Auth, Connectivity, and Secrets

## Objective
Make VEMS capable of authenticating to vtiger reliably in local/staging/prod-like environments with clear failure modes.

## Repo surfaces this phase targets
- `services/orchestration/src/adapters/transports.mjs`
- `scripts/validate-vtiger-connectivity.mjs`
- `scripts/validate-upstream-connectivity.mjs`
- `scripts/validate-connectivity.sh`
- `env/*.env`
- `scripts/start-env.sh`
- `docs/` setup and integration docs

## Current repo reality
The repo already has optional upstream connectivity validation and env-driven transport creation.
What is missing is a hardened vtiger auth model and a clear secret/config contract.

## Deliverables
- Explicit env variable contract for vtiger connectivity and auth
- Auth flow documentation and implementation notes
- Stronger connectivity validation with actionable failures
- Secret-handling guidance for local, staging, and production
