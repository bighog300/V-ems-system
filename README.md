# Ambulance Platform

Operational and clinical orchestration platform for an emergency ambulance service.

## Core systems
- **Vtiger**: operational workflow, calls, incidents, dispatch, vehicles, stock, personnel
- **OpenEMR**: patient identity, encounters, observations, interventions, handover
- **Custom platform**: control UI, crew app, orchestration, sync, dashboards

## Repo layout
- `docs/` all documentation
  - `docs/build-pack/` human-readable design and build docs
  - `docs/specs/` machine-readable contracts
  - `docs/root-legacy/` legacy root-level docs moved under `docs/`
- `apps/` frontend applications
- `services/` backend services
- `packages/` shared code
- `db/` local orchestration database migrations and seeds
- `infra/` docker and CI/CD

## Build order
1. shared types and config
2. api-gateway skeleton
3. orchestration skeleton
4. Vtiger and OpenEMR adapters
5. incident and assignment workflows
6. web-control UI
7. mobile crew UI
8. stock, readiness, maintenance
9. tests and hardening

## Specs
See `docs/specs/` for the machine-readable build contracts.

## Local + staging-like environment commands

### 1) Bootstrap once
```bash
make bootstrap
```

### 2) Start all runtime services (API + web + sync worker)
```bash
make start-env ENV=development
```

### 3) Run smoke tests
```bash
make smoke ENV=development
```

### 4) Run full tests
```bash
npm test
```

### 5) Stop environment
```bash
make stop-env
```

### Environment files
- `env/development.env`: reproducible local defaults
- `env/staging.env`: staging-like placeholder config
- `env/development.local.env`: optional local override file loaded after `env/development.env`

### One-off service startup
- API only: `make start-api ENV=development`
- Web control only: `make start-web ENV=development`
- Sync worker only: `make start-worker ENV=development`

## Notes
This starter bundle is designed to be imported into GitHub and used with AI-assisted execution tools.
