# Phase 2 — Reproducibility and Deployment

## Objective
Convert the current codebase from "works in a familiar environment" to "boots, tests, and deploys predictably for another engineer and in CI".

This phase corresponds to **Phase B** in the repo docs.

## Repo reality this bundle is based on
The repo already contains:
- npm workspaces in root `package.json`
- startup scripts in `scripts/bootstrap.sh`, `init-db.sh`, `start-env.sh`, `stop-env.sh`, `smoke.sh`
- Docker Compose files in `infra/docker-compose.dev.yml` and `infra/docker-compose.staging.yml`
- environment files in `env/` and `infra/`
- a basic CI workflow in `.github/workflows/ci.yml`

The repo docs still identify setup automation, health checks, CI/CD hardening, and real deployment reproducibility as unfinished.

## Exact scope
1. Make root workspace installs/tests consistent.
2. Make local and staging startup scripts trustworthy.
3. Align docs so there is one canonical startup flow.
4. Improve CI so it reflects real repo health.
5. Reduce ambiguity between `env/` and `infra/.env*` runtime sources.

## Deliverables
- reproducible root install + test
- validated startup path
- consistent environment loading
- stronger CI
- updated docs matching actual behavior
