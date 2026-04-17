# Codex Execution Brief — Remaining Production Work

## Objective
Complete all production-readiness items that are still **partial** or **open**.

## Scope
This work is limited to the following issue IDs:
- 1, 2, 3, 4, 5, 6, 7, 11, 12, 15, 16

## Repo areas expected to change

### Authentication / identity
- `services/api-gateway/src/auth.mjs`
- `services/api-gateway/src/server.mjs`
- add `services/api-gateway/src/auth/` files if needed

### Integrations
- `services/orchestration/src/adapters/transports.mjs`
- `services/orchestration/src/adapters/openemr/*`
- `services/orchestration/src/adapters/vtiger/*`
- `services/orchestration/src/sync-worker-service.mjs`
- `services/orchestration/src/sync-worker.mjs`

### Database runtime
- `services/orchestration/src/db.mjs`
- `services/orchestration/src/migrations/*`
- `services/orchestration/src/repositories/*`
- backup/restore scripts as needed

### Docker / runtime / infra
- `infra/docker-compose.dev.yml`
- `infra/docker-compose.staging.yml`
- `infra/services/openemr/Dockerfile`
- `infra/services/openemr/init-scripts/*`
- `infra/services/vtiger/Dockerfile`
- `infra/services/vtiger/init-scripts/*`
- env files and runtime docs

### Ops / security / observability
- `.github/workflows/*`
- `scripts/*`
- `docs/ops/*`
- logging/metrics files under services and shared packages

## Hard requirements
1. Remove the orchestration dependency on any external `sqlite3` CLI binary.
2. Keep changes as small as possible while making the system more production-complete.
3. Do not redesign core EMS domain workflows.
4. Preserve existing public API contracts unless a change is clearly required for a remaining issue.
5. Add or update tests for every code-path change that is testable in-repo.
6. Update docs to match the final runtime behavior.
7. End only when all repo tests pass.

## Preferred technical direction

### Issue 1 — Authentication
Implement a production-oriented auth path:
- support asymmetric JWT verification via JWKS if feasible
- support issuer and audience verification
- keep current auth behavior usable in local dev with explicit dev-mode settings
- derive actor identity and role from verified claims only

### Issue 2 — Integrations
Make adapters production-usable:
- clear base URL and auth config
- request timeout handling
- retry-safe semantics
- upstream error mapping
- endpoint path configuration
- integration-focused tests around transport behavior and failure classification

### Issue 3 — Database runtime
Replace the external CLI dependency with a real embedded/runtime DB approach.
Preferred order:
1. a proper Node-accessible runtime DB library
2. if repo/package policy prevents that, move orchestration persistence to an already-supported production DB path in the repo
Avoid any shell-out DB execution model.

### Issue 4 — Docker/runtime boot validation
Make the stack self-starting and testable:
- images build
- entry points execute required init
- services wait for dependencies correctly
- health checks reflect real readiness
- scripts support a successful smoke run

### Issue 5 — Secrets
Move from placeholder conventions to a defined injection model:
- no committed real secrets
- clear required variables
- local dev template vs staging/prod expectation
- docs for secret provisioning

### Issue 6 — Backup/restore
Complete recovery design:
- DB backup commands for actual deployed DB mode
- volume backup guidance where required
- restore verification steps
- testable scripts where possible

### Issue 7 — Authorization hardening
Centralize policies:
- define role-to-action mapping in one place
- ensure operator/admin/support boundaries are explicit
- cover support and replay paths

### Issue 11 — Observability
Complete minimum production telemetry:
- exportable metrics endpoint or standard metrics format
- structured logs with request correlation
- documented alert-worthy signals
- health and readiness definitions

### Issue 12 — Process supervision
Define and implement:
- restart behavior
- graceful shutdown
- startup ordering
- container or script-based supervision model

### Issue 15 — TLS / ingress
Implement runtime-facing ingress/TLS artifacts or deployment manifests sufficient for this repo:
- reverse proxy or ingress configuration
- HTTPS redirect / secure headers model
- doc how it is applied in staging/prod

### Issue 16 — Governance / compliance
Operationalize the docs:
- add actionable runbooks/checklists for audit review, retention, access review, and incident response
- make responsibilities and cadence explicit

## Deliverables
- code changes
- updated docs
- updated tests
- final summary grouped by issue ID
