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
- Required secrets are validated at startup (`validate_required_runtime_secrets`).
- Deployments fail fast on missing DB/admin credentials and TLS material.

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
