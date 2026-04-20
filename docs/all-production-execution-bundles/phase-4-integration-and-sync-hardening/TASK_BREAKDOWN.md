# Task Breakdown

## A. Sync worker reliability
Inspect:
- `services/orchestration/src/sync-worker.mjs`
- `services/orchestration/src/sync-worker-service.mjs`
- orchestration repositories and adapter clients
- sync-related tests

### Required changes
1. Confirm retries are bounded and intentional.
2. Distinguish:
   - retryable downstream failure
   - auth/configuration failure
   - permanent payload/data mapping failure
3. Avoid reprocessing already completed work.
4. Ensure dead-letter or equivalent terminal-failure state is queryable.

## B. Adapter/client hardening
Inspect tests and clients for:
- OpenEMR adapter
- Vtiger adapter
- payload mappers
- transport behavior

### Required changes
1. Improve timeout handling.
2. Improve error classification and operator-facing messages.
3. Ensure correlation/request identifiers flow through logs and support payloads.
4. Keep payload mapping deterministic and test-backed.

## C. Diagnostics and support surfaces
Inspect:
- `services/api-gateway/src/server.mjs`
- `apps/web-control/src/diagnostics.mjs`
- `apps/web-control/src/logistics.mjs`
- support/metrics routes and tests

### Required changes
1. Expose enough data to debug sync health.
2. Avoid turning diagnostics into a data dump.
3. Surface backlog/failure/last-success signals where possible.
4. Ensure front-end dashboards match backend metrics payloads.

## D. Degraded mode
Define behavior for:
- upstream unavailable at startup
- upstream failure during runtime
- queued sync build-up
- operator actions while sync is impaired

The result should be explicit in docs and reflected in tests.
