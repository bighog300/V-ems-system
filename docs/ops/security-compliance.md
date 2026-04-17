# Security, Governance, and Compliance Operations

## Authentication and identity controls

- API gateway supports verified JWT claims for `HS256` and `RS256` (JWKS).
- Identity (`actor_id`) and role are derived from verified token claims.
- Header-trust mode is allowed only when explicitly enabled (`AUTH_TRUST_HEADERS=true`).

## Authorization governance

- Route authorization policy is centralized in `services/api-gateway/src/authorization-policy.mjs`.
- Least-privilege review cadence: **monthly**.
- Policy owner: **Platform Security Lead**.

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
