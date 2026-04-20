# Phase 4 — VEMS-side Smoke and Integration Tests for vtiger

## Objective
Add a trustworthy VEMS-side test path that proves vtiger integration works instead of merely assuming sync health.

## Repo surfaces this phase targets
- `scripts/smoke.sh`
- `scripts/smoke-test.mjs`
- `scripts/test-adapter-connections.sh`
- `scripts/validate-vtiger-connectivity.mjs`
- orchestration integration tests
- API gateway tests
- diagnostics/logistics/supervisor UI tests

## Current repo reality
The repo already has:
- smoke scripts
- upstream validation toggles
- diagnostics reporting
- UI tests that mention vtiger-targeted sync failures

This phase should turn that into a real integration confidence story.
