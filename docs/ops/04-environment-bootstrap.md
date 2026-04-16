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
