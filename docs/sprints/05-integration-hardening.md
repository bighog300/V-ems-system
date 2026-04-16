# Sprint 5 — Integration Hardening

## Goal
Make integrations reliable against real upstream environments.

## Scope
- Real adapter auth/connectivity
- Config hardening
- Sync visibility
- Connectivity validation

## Tasks
- Implement real adapter auth/config handling
- Add connectivity validation/health behavior
- Improve sync visibility/debug behavior
- Tune retry/error classification for real external failures

## Acceptance Criteria
- Adapters can be configured for real upstream connections
- Connectivity can be validated
- Sync failures are diagnosable
- Worker behavior remains safe and test-covered

## Non-goals
- No new domain workflows
- No full production rollout
