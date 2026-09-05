# VEMS Monorepo

VEMS is a JavaScript monorepo for an EMS dispatch + clinical workflow prototype.

## What is in this repo

- `services/api-gateway` — HTTP API for incidents, assignments, patient linkage, encounters, observations, interventions, and handover.
- `services/orchestration` — domain logic + SQLite-backed persistence used by the gateway.
- `apps/web-control` — static/operator web UI served by a tiny Node server.
- `packages/shared` — shared constants, status machines, and error helpers.
- `scripts/` — bootstrap, start/stop environment, smoke, and connectivity helpers.

## Prerequisites

- Node.js 20+.
- npm 10+.
- Python 3 (used by orchestration SQLite runtime bridge in `services/orchestration/src/db.mjs`).
- Bash (repo scripts are shell-based).

## Install

```bash
npm install
```

## Common commands (from repo root)

```bash
npm test
npm run bootstrap
npm run init-db
npm run start:env
npm run stop:env
npm run smoke
npm run perf:load
```

## Service-local commands

```bash
npm run test -w @vems/api-gateway
npm run test -w @vems/orchestration
npm run test -w @vems/web-control
npm run start -w @vems/api-gateway
npm run start -w @vems/web-control
npm run start:sync-worker -w @vems/orchestration
```

## Auth/RBAC behavior in local development

Authentication is development-header based:

- `x-user-role`
- `x-actor-id`
- `x-request-id` (optional)
- `x-correlation-id` (optional)

RBAC is enforced only when `RBAC_ENFORCE=true`; otherwise routes still resolve for local workflow/testing.

## Notes

- Storage defaults to SQLite at `.data/platform.sqlite` (or `VEMS_DB_PATH`).
- No system `sqlite3` executable is required.
- This repo is npm-workspace driven; Docker services are defined under `infra/`.

## Local baseline before adapter integration

`npm run smoke` checks an already-running API; it does not start services.
For the SQLite-backed application baseline, run:

```bash
npm run start:env -- --app-only
curl --fail http://localhost:3001/health
npm run smoke
```

The example health URL assumes `API_PORT=3001` in `env/development.local.env`.
Runtime scripts load `env/development.env`, then `env/development.local.env`.
The `--app-only` option starts the API and web control with upstream transports
unconfigured. It does not launch the sync worker or Docker services, so baseline
checks do not consume queued integration work. This supports baseline checks alongside separately
managed Vtiger/OpenEMR installations. Full `npm run start:env` also starts the
Compose stack and requires its configured host ports to be free. Its infra env
file is parsed as dotenv data (Node.js 20.12+), never executed as shell code.
Startup waits for API and web readiness and reports failures with a nonzero exit.
Smoke signs short-lived request tokens using the loaded `JWT_HS256_SECRET` when
JWT authentication is configured; trusted-header mode continues to use headers.
Credentials and generated tokens are never printed. The default smoke covers
local incident creation, assignment, and listing with RBAC disabled; it does not
verify real Vtiger/OpenEMR adapters.

## Crew datetime contract

Crew `datetime-local` fields represent wall-clock time in the browser's configured
timezone. Defaults display the supplied instant in that zone. Payload builders
run in the browser and interpret the input in the same zone, using the offset at
the entered date (including daylight saving), then serialize an ISO 8601 UTC
instant ending in `Z`. The server's timezone is not involved. Never append `Z`
to a wall-clock input or treat it as UTC without conversion.

The same wall-clock text intentionally represents different instants in different
browser zones. JavaScript Date semantics apply at DST transitions: repeated times
select the earlier instant; nonexistent times advance by the gap. Offset-qualified
input already identifies an instant and must not be adjusted twice.

UTC fixture tests explicitly configure their test process timezone. Isolated
regression processes cover UTC, Europe/London (winter, summer, and transitions),
America/New_York, and Asia/Kolkata, including UTC date rollover. These expectations
are independent of the developer/CI host timezone; browser behavior is unchanged.
