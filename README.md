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

## Notes
This starter bundle is designed to be imported into GitHub and used with AI-assisted execution tools.
