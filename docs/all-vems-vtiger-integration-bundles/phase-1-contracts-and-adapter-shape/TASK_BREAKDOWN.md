# Task Breakdown

## A. Freeze the vtiger operations contract
Create or update docs under `docs/` or `docs/specs/` for these VEMS-side operations:
1. `createIncidentMirror`
2. `updateIncidentMirror`
3. `createAssignmentMirror`
4. `updateAssignmentMirror`

For each operation, define:
- source VEMS entity/event
- target vtiger module/entity
- required fields
- optional fields
- idempotency key strategy
- correlation ID handling
- expected success response
- retryable failure classes
- terminal failure classes

## B. Standardize transport expectations
Inspect `services/orchestration/src/adapters/transports.mjs`.

Required outcomes:
- one consistent vtiger transport function signature
- normalized error object shape including:
  - `message`
  - `code`
  - `classification`
  - `httpStatus` if applicable
  - `retryable`
- no hidden assumptions in sync worker about transport internals

## C. Sync-intent payload expectations
Inspect:
- sync intent repository
- outbox/event creation paths
- orchestration service methods that generate sync intents

Required outcomes:
- every vtiger-bound sync intent includes enough context to diagnose failures
- payloads include a stable reference ID
- payloads include correlation/request identifiers where practical
- target entity type naming is consistent

## D. Diagnostics contract
Ensure `supportDiagnosticsReport` and front-end diagnostics/logistics surfaces can describe vtiger failures in a stable, operator-readable way.

Required outcomes:
- failed vtiger intents show consistent classification
- reference IDs point to the originating VEMS entity where possible
- the UI can display target, intent type, attempt count, and last error clearly
