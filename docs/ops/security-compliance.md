# Security, Governance, and Compliance Operations

## Authentication and identity controls

- API gateway supports verified JWT claims for `HS256` and `RS256` (JWKS).
- Identity (`actor_id`) and role are derived from verified token claims.
- Header-trust mode is allowed only when explicitly enabled (`AUTH_TRUST_HEADERS=true`).

## Authorization governance

- Route authorization policy is centralized in `services/api-gateway/src/authorization-policy.mjs`.
- Least-privilege review cadence: **monthly**.
- Policy owner: **Platform Security Lead**.

## PHI-safe logging and telemetry (Stage 12 milestone 12e)

- Server logs (`packages/shared/src/logging.mjs`, used by every `logger.*()`
  call site in `services/api-gateway`) pass only a hand-picked set of safe
  fields per call site -- identifiers (`incident_id`, `patient_case_id`,
  etc. -- internal reference numbers, never demographic/clinical values),
  status codes, durations, and enum-like values. No call site logs a
  request payload, a database record, or a named PHI field (name, DOB,
  phone, address, SSN, medication, vitals, notes) wholesale.
- Any `Error` value passed to the logger is narrowed to `{name, message,
  stack}` before serialization (`safeJson`), dropping every other own
  property -- this matters because driver errors (e.g. a Postgres unique-
  constraint violation's `.detail`) can carry the literal conflicting
  column *value*, not just a generic message. Covered by
  `packages/shared/test/logging.test.mjs`.
- `npm run lint` (`scripts/lint.mjs`) statically scans every `logger.*()`
  call site across the repo and fails the build if one references a
  payload/record wholesale or a named PHI field -- a regression guard, not
  a runtime data check, so it catches the common mistake (someone logging
  an object wholesale) without false confidence about catching everything.
- Mobile telemetry (`apps/mobile-crew/src/telemetry/telemetry.ts`) is a
  closed, hand-reviewed event allowlist (`TelemetryEvent`): every field on
  every event variant is a status/count/enum/duration/path, never a
  patient demographic, clinical value, token, or secret. Both TypeScript's
  excess-property check (compile time) and a runtime field allowlist
  (`redact()`, defense in depth against a loosely-typed caller) enforce
  this -- adding a new telemetry event means extending and re-reviewing the
  union, not passing an arbitrary object through. Covered by
  `apps/mobile-crew/test/telemetry.test.ts`.

## Secret management controls

- Committed `.env` files use placeholders only (`__set_in_local_env__`).
- Upstream-system secrets (Vtiger/OpenEMR/MySQL DB and admin credentials,
  TLS material) are validated at deploy time by
  `scripts/lib.sh`'s `validate_required_runtime_secrets()` /
  `require_non_placeholder_env()` -- deployments fail fast on missing or
  placeholder values.

### Application secrets (Stage 12 milestone 12f)

V-EMS's own security-sensitive values -- the JWT signing secret, the
Postgres connection string, and the object-storage encryption key -- are
checked in-process, at construction time, rather than only by a deploy-time
script. Each is resolved and validated by the same shared building blocks
(`packages/shared/src/secure-startup.mjs`: `isProductionEnv`,
`isInsecureSecret`, `connectionStringHasInsecurePassword`), embedded
directly in the module that resolves the value:

- `services/api-gateway/src/server.mjs` (`createApp`) refuses to start in
  production with `AUTH_TRUST_HEADERS=true` (header-based identity is
  forgeable) or with no way to verify a bearer token at all -- a missing or
  placeholder `JWT_HS256_SECRET` and no `JWT_JWKS_URI` configured for RS256.
- `services/orchestration/src/postgres-client.mjs` (`PostgresClient`)
  refuses to start in production against a missing `VEMS_POSTGRES_URL` /
  `DATABASE_URL`, or one embedding a common default password (e.g.
  `postgres:postgres@...`).
- `services/orchestration/src/storage/object-storage.mjs`
  (`FilesystemObjectStorage`) refuses to start in production without a real
  `VEMS_OBJECT_STORAGE_KEY` (32 bytes, hex or base64) -- outside production
  it falls back to a fixed, publicly-known development key so local/test
  runs work with zero setup.

These checks live in the low-level modules themselves, not in one process's
entry point, because `OrchestrationService` (and so `PostgresClient` /
`FilesystemObjectStorage`) is constructed independently by two separate
production processes: the API gateway's HTTP server and the orchestration
service's sync-worker process. Both are covered without a shared
entry-point wrapper.

"Insecure" is deliberately narrow -- missing, empty, or one of a short list
of common placeholder/default values (`changeme`, `password`, `postgres`,
`__set_in_local_env__`, etc; see `PLACEHOLDER_SECRET_VALUES` in
`secure-startup.mjs`) -- so the check catches the mistake of deploying with
defaults left in place without trying to judge real secret strength.
Covered by `packages/shared/test/secure-startup.test.mjs`,
`services/orchestration/test/postgres-client.test.mjs`,
`services/orchestration/test/object-storage.test.mjs`, and
`services/api-gateway/test/production-readiness-foundations.test.mjs`.

### Key rotation

- **JWT signing secret**: generate a new high-entropy `JWT_HS256_SECRET` (or
  switch to RS256/JWKS via `JWT_JWKS_URI`), deploy it, and invalidate
  outstanding tokens signed with the old secret (they simply stop verifying
  once the old value is gone). Coordinate with any RS256 key rotation
  through the JWKS endpoint's normal key-id (`kid`) rollover instead of a
  hard cutover.
- **Object-storage encryption key** (`VEMS_OBJECT_STORAGE_KEY`): existing
  objects were encrypted under the old key, so a rotation needs a
  re-encryption pass (read each object with the old key, write it back with
  the new one) rather than a plain in-place swap -- swapping the key alone
  makes every previously-stored object unreadable.
- **Database credentials** (`VEMS_POSTGRES_URL/DATABASE_URL`): rotate at the
  Postgres role level (create/enable the new credential, update the
  connection string, disable the old credential) so the change is a
  redeploy, not a maintenance window.
- All three are deployment-environment configuration, never committed to
  the repository; committed `.env` files carry only the
  `__set_in_local_env__` placeholder (or, for `VEMS_OBJECT_STORAGE_KEY`,
  are left unset so local dev keeps using its built-in fallback key --
  unlike the other placeholders, this one is decoded and length-checked
  whenever it *is* set).

## Audit, access review, and incident response

### Access review checklist (monthly)
- Review role assignments for dispatcher/field_crew/supervisor/operations_manager/sys_admin.
- Confirm no shared admin credentials remain in runtime env.
- Record approvals and revocations in ticketing system.

### Audit log review (weekly)
- Sample at least 20 audit entries from incident, encounter, and sync replay actions.
- Verify correlation IDs are present and traceable across API + worker logs.
- Escalate unexplained privileged actions within 1 business day.

### Incident response runbook (security)
1. Contain: disable affected credentials/tokens.
2. Triage: identify impacted actor IDs and time window from correlation IDs.
3. Recover: rotate secrets and revalidate service health/smoke checks.
4. Report: complete post-incident record within 72 hours.
