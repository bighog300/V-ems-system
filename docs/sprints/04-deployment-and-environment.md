# Sprint 4 — Deployment & Environment

## Goal
Make the platform reproducibly deployable in local and staging-like environments.

## Scope
- Bootstrap scripts
- Local environment setup
- Worker/service startup commands
- Health checks
- Smoke tests

## Tasks
- Add Makefile or equivalent command surface
- Add bootstrap/init scripts
- Add environment startup scripts
- Add health check usage documentation
- Add smoke test scripts for core system paths

## Acceptance Criteria
- Local/staging-like environment can be started from scripts
- Services and worker start consistently from config
- Smoke tests can validate core paths after startup
- Environment usage is documented clearly

## Non-goals
- No production infrastructure rollout
- No advanced cloud provisioning unless already in repo
