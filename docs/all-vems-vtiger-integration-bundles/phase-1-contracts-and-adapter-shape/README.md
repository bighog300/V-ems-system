# Phase 1 — VEMS↔vtiger Contracts and Adapter Shape

## Objective
Define and implement the VEMS-side contract for vtiger so the sync worker, diagnostics, and tests all agree on:
- supported operations
- payload shapes
- success/failure semantics
- correlation and idempotency expectations

## Repo surfaces this phase targets
- `services/orchestration/src/sync-worker.mjs`
- `services/orchestration/src/sync-worker-service.mjs`
- `services/orchestration/src/adapters/transports.mjs`
- `services/orchestration/src/repositories/sync-intent-repository.mjs`
- `services/api-gateway/src/server.mjs`
- `scripts/validate-vtiger-connectivity.mjs`
- `scripts/validate-upstream-connectivity.mjs`
- `apps/web-control/src/diagnostics.mjs`
- `apps/web-control/src/logistics.mjs`

## Current repo reality
The worker already routes vtiger intents using these methods:
- `createIncidentMirror`
- `updateIncidentMirror`
- `createAssignmentMirror`
- `updateAssignmentMirror`

The API gateway already exposes sync intent diagnostics and recent failed intents.
The missing piece is a hardened, explicit contract for vtiger transport behavior and payload mapping.

## Deliverables
- A written contract doc for each vtiger operation
- Stable request/response/error model for VEMS-side vtiger transport
- Explicit correlation ID propagation requirements
- A contract test plan covering each operation

## Completion gate
This phase is done when the repo contains a clear VEMS-side vtiger contract that Codex can implement against without guessing field names or retry semantics.
