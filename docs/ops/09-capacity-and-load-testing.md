# Capacity and Load Testing (Stage 12 milestone 12j)

This is the last milestone of Stage 12 (issue #69) and its exit gate is
explicit: *"a load test meets its documented concurrency/latency target
without duplicate sync processing."* This document is that target, the
numbers backing it, and what those numbers are (and aren't) evidence of.

All numbers below were captured against a **real local Postgres 16**
instance and real `FilesystemObjectStorage` on disk -- the actual
production backends from milestones 12b/12c, not SQLite. Concurrency
correctness under Postgres depends on real row-level locking that SQLite's
single-connection lock provides for free; a baseline measured against
SQLite would not have caught the bug described below.

## A real bug this exercise found and fixed

Load-testing the sync worker's `claim()` primitive against two independent
Postgres connections (the actual shape of two separate sync-worker
processes, not two calls sharing one connection) reproduced a genuine race
100% of the time before the fix:

- **Original `claim()`** did a `SELECT` to check claimability, then a
  separate `UPDATE`. Two connections could both read "claimable" before
  either write landed, both update, and both return `true` -- both would
  go on to process (and, in production, double-submit to Vtiger/OpenEMR)
  the same intent.
- **Fix**: a single atomic `UPDATE ... WHERE ... RETURNING` statement
  (`services/orchestration/src/repositories/sync-intent-repository.mjs`).
  A second concurrent `UPDATE` against the same row blocks on Postgres's
  row lock, then re-evaluates its `WHERE` against the now-committed row
  once unblocked -- so at most one of two racing claims can match. The
  `WHERE` clause also had to be tightened to mirror `listPending()`'s own
  claimability predicate exactly (pending, or processing with an expired
  lease) rather than just "not currently processing" -- the looser check
  let a worker whose local `listPending()` snapshot went stale mid-loop
  re-claim (and reprocess) an intent another worker had already finished.
- A related fix: claim tokens were `${process.pid}-${Date.now()}-${intentId}`,
  which can collide between two genuinely independent workers in a
  containerized/serverless deployment where the process is commonly PID 1
  -- two workers processing the same intent in the same millisecond would
  generate an identical token. Tokens now include a `randomUUID()`
  component, making a collision between independent workers impossible
  regardless of pid/clock resolution.

Regression coverage: `services/orchestration/test/sync-intent-concurrent-claim.test.mjs`,
gated on `VEMS_TEST_POSTGRES_URL` like the rest of the Postgres-specific
suite -- it reproduces the exact two-connection race and asserts exactly
one of two concurrent claims on the same intent ever succeeds, plus a
10-intent/2-worker drain that asserts zero duplicate claims and every
intent ends up `succeeded` exactly once.

## Sync worker capacity target

Measured with `npm run perf:load:sync-worker` (`scripts/load-test-sync-worker.mjs`):
500 seeded intents, a 20ms simulated downstream call (a reasonable stand-in
for a real Vtiger/OpenEMR round-trip), draining with independent
`SyncWorker` instances (independent Postgres connections, matching real
deployment):

| Workers | Duration | Throughput | Duplicates |
|---|---|---|---|
| 1 | 11.56s | 43.2 intents/sec | 0 |
| 4 | 3.01s | 166.3 intents/sec | 0 |

**Target: at least 150 intents/sec sustained with 4 concurrent sync-worker
processes, zero duplicate processing.** Near-linear scaling with worker
count (43→166 is ~3.8x for 4x the workers) means adding workers is the
right lever if queue depth grows faster than this; there's no serialization
bottleneck in the claim/process/mark-succeeded path at this end of the
range. Re-run with `LOAD_TEST_SYNC_INTENTS`/`LOAD_TEST_SYNC_WORKERS`/
`LOAD_TEST_SYNC_LATENCY_MS` set to your deployment's actual expected queue
depth and downstream latency before relying on this number for capacity
planning against a different profile.

## Dispatcher workload target

Measured with `npm run perf:load` (`scripts/load-test-api.mjs`) against a
live api-gateway instance backed by real Postgres + object storage:

**`POST /api/incidents`** (300 requests, concurrency 20):

| Metric | Value |
|---|---|
| Throughput | 239.6 req/sec |
| p50 | 52.7ms |
| p95 | 199.7ms |
| p99 | 289.7ms |
| Failures | 0 |

**Target: p95 < 250ms, p99 < 350ms, 0 failures, at 20 concurrent
dispatchers creating incidents.** 20 concurrent dispatcher sessions is
already generous headroom for any single EMS agency's dispatch desk.

**`GET /api/incidents` (the dispatch board listing)** -- measured at two
very different working-set sizes, which turned out to matter a great deal:

| Open incidents in the table | p50 | p95 | p99 |
|---|---|---|---|
| 30 (a realistic live board) | 75ms | 128ms | 143ms |
| 300+ | 2396ms | 2878ms | 3006ms |

**Target at realistic scale (≤ ~50 open incidents): p95 < 200ms.** At 300+
open incidents, latency is roughly 20x worse and does not meet any
reasonable target -- see "Known limitation" below. `Open` incidents means
ones still on the active board; closed/dispositioned incidents don't
accumulate in this working set in normal operation, so 300+ *concurrently
open* incidents would itself be an unusual, and probably alarming,
real-world scenario for a single agency -- but the load test found the
endpoint doesn't degrade gracefully if it happens.

### Known limitation: `listIncidentsForBoard` is O(n) round-trips, not O(1)

`OrchestrationService.listIncidentsForBoard()` (`services/orchestration/src/index.mjs`)
issues two additional queries (`assignments.findByIncidentId`,
`patientCases.list`) *per incident* rather than a join or a batched
lookup. Each is a separate network round-trip to Postgres, so the whole
call is O(n) round-trips for n open incidents -- fine at the realistic
scale measured above, but the reason latency is ~20x worse at 300+ open
incidents. Fixing this (a join-based or batched rewrite of the endpoint)
is out of scope for this milestone, which is about measuring and
documenting capacity, not rewriting query patterns -- flagged here as
follow-up work, with the numbers above as the evidence for prioritizing it
before working-set size grows past what's been measured safe.

## Crew workload target

`POST /api/incidents` and `GET /api/incidents` above already cover the
generic authenticated-write/authenticated-read shape crew traffic also
takes. As a crew-specific example, **`POST /api/push-tokens`** (device
push-token registration, a pure local write with no external dependency --
300 requests, concurrency 20):

| Metric | Value |
|---|---|
| Throughput | 688.0 req/sec |
| p50 | 17.4ms |
| p95 | 80.4ms |
| p99 | 93.3ms |
| Failures | 0 |

**Target: p95 < 150ms, p99 < 200ms, 0 failures, at 20 concurrent crew
sessions**, for any endpoint of this shape (a local DB write with no
external system call in the request path). Endpoints that call OpenEMR or
Vtiger synchronously in the request path (e.g. `POST /api/patients`) were
not load-tested here -- doing so needs a running (real or stub) OpenEMR/
Vtiger transport, which this exercise didn't stand up; their latency
target is bounded by that external system's own SLA, not this API
gateway's overhead, and should be measured separately against a real or
faithfully-stubbed upstream before being relied on for capacity planning.

## Reproducing these numbers

```bash
# Dispatcher/crew HTTP workloads -- point at a live api-gateway instance
# backed by Postgres (VEMS_DB_DRIVER=postgres) and real object storage.
API_BASE_URL=http://127.0.0.1:8080 \
LOAD_TEST_REQUESTS=300 LOAD_TEST_CONCURRENCY=20 \
LOAD_TEST_ROLE=dispatcher LOAD_TEST_ENDPOINT_PATH=/api/incidents \
npm run perf:load

# GET workloads: LOAD_TEST_METHOD=GET (no payload/idempotency-key sent).
# Non-default payload shapes (e.g. push-token registration):
# LOAD_TEST_PAYLOAD_JSON='{"platform":"ios","expo_push_token":"tok-{{index}}"}'
# ({{index}} is substituted with each request's own index.)

# Sync worker -- requires a real Postgres backend directly, not through
# the API gateway.
VEMS_POSTGRES_URL=postgresql://user:pass@host:5432/vems \
LOAD_TEST_SYNC_INTENTS=500 LOAD_TEST_SYNC_WORKERS=4 LOAD_TEST_SYNC_LATENCY_MS=20 \
npm run perf:load:sync-worker
```

Both scripts exit non-zero on any failure/duplicate, so they're safe to
wire into a CI capacity-regression job later if desired -- not done as
part of this milestone, since neither script currently starts its own
Postgres/api-gateway instance (both assume one is already running), which
is a meaningful step beyond documenting and manually validating today's
baseline.
