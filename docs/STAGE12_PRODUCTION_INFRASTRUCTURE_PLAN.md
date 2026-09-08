# Stage 12 — Production Clinical Infrastructure: Execution Plan

Tracking: issue [#69](https://github.com/bighog300/v-ems-system/issues/69). Builds on
Stage 11's completed mobile-native field UX (issue #68, merged in full — the two
physical-device/pilot items in its exit gate roll into Stage 14).

This is the milestone-level "what order, what's in scope, what's deferred" layer —
issue #69 already carries the full task/acceptance-criteria checklist and isn't
repeated here.

## Where Stage 11 leaves off

The app now charts a full offline-capable PCR with camera/document attachments,
barcode scanning, push notifications and device identity — but every one of those
still lands in a single-node SQLite file with no encryption at rest for the database
itself, no real object storage (Stage 11's attachments sit queued on-device pending
this stage), no session/device revocation, and no production-grade secrets or backup
story. Stage 12 is what turns that prototype-grade persistence into something safe to
run concurrent EMS crews against.

## Design decisions

Four scope-boundary questions were resolved before starting:

### Sync→async: convert the whole orchestration layer first, not a parallel path

Every repository and every `OrchestrationService` method today is synchronous,
written directly against `node:sqlite`'s sync API — `SqliteClient.queryOne`/`queryAll`/
`execute`/`transaction`/`withTransaction` are all sync, and nothing in
`services/orchestration/src` ever awaits a DB call. A real Postgres client is
inherently async (it's network I/O; there's no synchronous Postgres driver worth
using in production). **Decided**: milestone 12a converts every repository method and
every `OrchestrationService` method to `async`/`await` up front, against a shared
async DB-client interface (`queryOne`/`queryAll`/`execute`/`withTransaction`) that
both `SqliteClient` (trivially wrapped) and a new `PostgresClient` implement. Every
milestone after 12a builds on one async code path — never two implementations to keep
in sync, never a risk of the SQLite and Postgres call graphs silently diverging.

### Object storage: filesystem-backed for now, not S3-compatible

Stage 11 deliberately queued attachments locally rather than build a throwaway
upload endpoint before object storage existed. **Decided**: rather than adding an
S3-compatible client (AWS SDK v3 against a configurable endpoint, works against both
real S3 and self-hosted MinIO) as originally proposed, Stage 12 builds the encrypted
object-storage *interface* first and a filesystem-backed implementation behind it —
encryption at rest, checksum/hash verification, and retention controls all live
against the interface, not the backend. This satisfies "encrypted object storage" for
a single-host deployment without an external storage dependency; a real S3-compatible
backend becomes a drop-in second implementation of the same interface whenever that's
needed, not a Stage 12 rewrite.

### Device/session revocation: a V-EMS-side store, not delegated to the IdP

`auth.mjs` already verifies RS256 tokens against any standards-compliant external
JWKS-publishing IdP (or HS256 for simpler deployments) — V-EMS is a relying party,
never a token issuer. Issue #69 calls for "device/session inventory and remote
logout/revocation." **Decided**: rather than relying entirely on short token TTLs
and the external IdP's own introspection/revocation endpoint, Stage 12 adds a small
V-EMS-side revoked-sessions/devices store, checked on every authenticated request (one
indexed lookup). Revocation is then immediate and under V-EMS's own control
regardless of which IdP is deployed or how long its tokens live — and Stage 11's
device identity (`deviceId`, already attached to the mobile session and to push-token
registration) is the natural revocation key.

### Deployment target: harden the existing Docker Compose setup, not Kubernetes

`infra/docker-compose.staging.yml` and `docker-compose.dev.yml` already exist and
already have `healthcheck`/`restart: unless-stopped` on some services; no Kubernetes
manifests exist anywhere in this repo. **Decided**: Stage 12's process-supervision,
health/readiness and HA work extends the existing Compose files (Postgres and
object-storage services, healthchecks and restart policies for every dependency,
readiness endpoints the orchestrator and API gateway expose) rather than introducing
a Kubernetes deployment target this stage doesn't otherwise need.

## Milestones

Same incremental-PR pattern as Stages 9–11 — each step is independently reviewable
and testable. 12a is a hard prerequisite for everything after it; the rest are listed
in the order issue #69's dependencies suggest but are otherwise loosely coupled.

1. **12a — Async conversion of the orchestration layer.** Every repository class and
   every `OrchestrationService` method becomes `async`; `SqliteClient` gains an async
   wrapper satisfying a new shared `DbClient` interface
   (`queryOne`/`queryAll`/`execute`/`withTransaction`, all Promise-returning). No
   behavior change — this is a mechanical (if extensive) conversion, validated by the
   existing test suite passing with `await` added at every call site. Pure
   groundwork; nothing Postgres-specific lands yet.
2. **12b — PostgresClient and dual-backend migrations.** A new `PostgresClient`
   implementing the same `DbClient` interface (via `pg`), selected by env
   (`VEMS_DB_DRIVER=postgres`, defaulting to SQLite for tests/local/mobile-adjacent
   dev per issue #69). Migration files gain a Postgres-dialect variant where SQLite
   and Postgres syntax actually diverge (`AUTOINCREMENT` vs `SERIAL`, etc.); the
   `schema_migrations` runner and idempotency/audit/outbox/sync-intent semantics are
   preserved identically on both backends. Rollback tooling and a data-migration path
   from an existing SQLite deployment.
3. **12c — Encrypted object storage for attachments.** A storage-adapter interface
   (`putObject`/`getObject`/`deleteObject`, content-addressed with a checksum) and a
   filesystem-backed implementation with encryption at rest and retention controls,
   per the design decision above. Wires up the server-side half of Stage 11's
   attachment queue — mobile's queued attachments finally have somewhere to sync to.
4. **12d — Device/session revocation.** A revoked-sessions/devices table plus a
   request-path check in `auth.mjs`'s authentication flow, keyed by 11g's
   `deviceId`/actor identity. A revoke endpoint (supervisor/sys_admin only) and an
   audit trail of revocation events.
5. **12e — PHI-safe logging and mobile telemetry.** Audits every existing
   `logger.info`/`logger.warn` call site for PHI leakage, adds an automated
   scan/test guarding against a regression, and closes the "mobile telemetry that
   excludes PHI/secrets" item carried over from issue #68 (no telemetry pipeline
   exists yet at all going into this stage).
6. **12f — Production secrets and secure defaults.** Refuses to start in production
   mode with an insecure/default JWT secret, DB credentials or object-storage key;
   documents key management and rotation.
7. **12g — Backup, restore and disaster recovery.** Postgres and object-storage
   backup/restore scripts and a documented DR runbook covering V-EMS, Vtiger linkage
   state and OpenEMR integration state together (not just the database in isolation).
8. **12h — Health/readiness and Docker Compose hardening.** Readiness endpoints for
   every critical dependency (Postgres, object storage, OpenEMR/Vtiger reachability),
   and healthcheck/restart-policy coverage across `docker-compose.staging.yml` for
   every service that doesn't already have it.
9. **12i — Rate limiting, abuse protection and production RBAC defaults.** Per-actor
   request throttling on the API gateway and a hardened default RBAC policy set for
   production mode (today's `enforceRbac` flag becomes non-optional in production).
10. **12j — Capacity and load testing.** Documented concurrency/latency targets for
    dispatchers, crews and the sync worker under load, exercised against the
    Postgres/object-storage backend from 12b/12c.

## Exit gate

Per issue #69: PostgreSQL production mode passes the full Stage 1–11 regression
suite; a backup/restore drill recovers an accepted synthetic dataset and linkages;
attachment storage is encrypted, authorized, auditable and checksum-verified;
production mode refuses to start with insecure/default secrets or disabled RBAC; a
lost/revoked device cannot refresh its session; logs/metrics contain no PHI or
credentials under automated scan; and a load test meets its documented
concurrency/latency target without duplicate sync processing.
