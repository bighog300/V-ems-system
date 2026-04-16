# Duplicate submission protection beyond current idempotency paths

**Milestone:** Cross-Cutting Reliability & UX Hardening  
**Labels:** type:backend, type:frontend, priority:p0, domain:incident, domain:clinical

## Summary
Strengthen duplicate-protection behavior for user-driven submits and retries.

## Acceptance Criteria
- [ ] Critical write flows are protected against accidental duplicate submits
- [ ] UI disables or guards double-submit paths where practical
- [ ] Backend behavior remains authoritative
