# Task Breakdown

## A. Logging
Inspect:
- `packages/shared/src/logging.mjs`
- `services/api-gateway/src/server.mjs`
- `services/orchestration/src/index.mjs`
- `services/orchestration/src/sync-worker*.mjs`

### Required changes
1. Ensure logs contain correlation/request identifiers for critical writes and sync actions.
2. Use structured logs consistently instead of ad hoc console output in important paths.
3. Avoid logging sensitive payloads unnecessarily.

## B. Metrics
Inspect:
- `/api/support/metrics` implementation and tests
- load test script expectations
- diagnostics/logistics front-end consumption

### Required changes
1. Define a stable metrics payload for:
   - request volume/errors
   - sync backlog/failures
   - upstream health snapshots
   - closure/incident workflow counts if relevant
2. Ensure metrics are cheap enough to compute.
3. Keep payload shape documented.

## C. Dashboards and alerts
This repo may not contain a full monitoring stack. That is fine.

### Required changes
1. Add docs that specify:
   - which metrics to chart
   - alert thresholds for critical failures
   - ownership/escalation notes
2. If the repo already has a place for ops config, place artifacts there; otherwise create markdown under docs.

## D. Runbooks
Create concise runbooks for:
- API unhealthy
- upstream connectivity failure
- sync backlog growth
- repeated dead-letter growth
- DB restore / recovery
- release rollback
