# Environment Bootstrap and Deployment

This sprint provides an explicit script surface for local and staging-like runtime setup.

## Prerequisites
- Node.js + npm
- `sqlite3` CLI
- GNU Make

## Bootstrap
```bash
make bootstrap
```

What this does:
1. installs workspace dependencies (`npm install`)
2. creates `.data/` and `.pids/`
3. creates `env/development.local.env` from template (if missing)

## Start environment
### Development
```bash
make start-env ENV=development
```

### Staging-like local profile
```bash
make start-env ENV=staging
```

This starts:
- API Gateway (`services/api-gateway`) on `API_PORT`
- Web Control (`apps/web-control`) on `WEB_PORT`
- Sync Worker (`services/orchestration/src/sync-worker-service.mjs`)

Logs are written to `.logs/` and pid files to `.pids/`.

## Health and smoke checks
Run smoke tests against running services:
```bash
make smoke ENV=development
```

`make smoke` now waits for the API `GET /health` endpoint to become ready (with timeout) before running smoke requests, so no manual sleep is required after `make start-env`.

Smoke checks validate:
1. `GET /health`
2. `POST /api/incidents`
3. `GET /api/incidents`
4. `POST /api/incidents/{incidentId}/assignments`

## Stop environment
```bash
make stop-env
```

## Full test suite
```bash
npm test
```

## Load/performance baseline (API scaffold)
Run a repeatable baseline against the running API Gateway using the existing scaffold:

```bash
API_BASE_URL=http://127.0.0.1:8080 \
LOAD_TEST_REQUESTS=200 \
LOAD_TEST_CONCURRENCY=20 \
npm run perf:load
```

Optional knobs:
- `LOAD_TEST_TIMEOUT_MS` (default `15000`): per-request timeout for transport issues.
- `LOAD_TEST_ROLE` (default `dispatcher`): request role header.
- `LOAD_TEST_ENDPOINT_PATH` (default `/api/incidents`): POST endpoint used for baseline.
- `LOAD_TEST_INCLUDE_METRICS_SNAPSHOT` (default enabled): set to `false` to skip internal metrics snapshots.

The script prints JSON with:
- throughput: `throughput_rps`
- failures: `failure_count`, `status_counts`, `transport_errors`
- latency: `latency.min_ms`, `latency.avg_ms`, `latency.p50_ms`, `latency.p95_ms`, `latency.p99_ms`, `latency.max_ms`
- timing: `duration_ms`, `started_at`, `finished_at`
- optional gateway snapshots: `metrics_snapshot.before` and `metrics_snapshot.after`

Interpretation guidance:
1. Start with `failure_count`; non-zero means the baseline is unstable and should be fixed before tuning latency.
2. Compare `p95_ms` and `p99_ms` to `avg_ms`; large spread indicates queueing/saturation under concurrency.
3. Use `throughput_rps` and `duration_ms` together; rising duration with flat throughput suggests bottlenecks.
4. Use `metrics_snapshot.after.api_gateway.by_route` to validate the expected route absorbed test traffic.
