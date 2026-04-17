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
- This repo is npm-workspace driven; Docker/infra directories are not part of the current checked-in tree.
