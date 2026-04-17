# Security & Compliance Controls

## Authentication and Authorization
- API gateway validates Bearer JWT before RBAC checks.
- RBAC policies are route- and method-scoped.

## Secrets Management
- Runtime secrets are injected via environment and must not be committed.
- Compose files require explicit password env vars.

## Logging and Auditing
- Every request carries correlation and request identifiers.
- Incident/assignment/patient actions are written to audit logs.

## Backup and Recovery
- Backup/restore scripts support SQLite and MySQL modes.
- Run periodic restore drills to validate backup integrity.
