# Codex Prompt — Phase 5

You are finalizing VEMS-side operational readiness for the vtiger dependency.

Focus files:
- docs/readiness/runbook files you add or update
- support metrics/diagnostics documentation
- scripts/docs related to startup and smoke

Goals:
1. joint VEMS↔vtiger readiness checklist
2. runbooks for common vtiger integration incidents
3. cutover and rollback guidance
4. operator-visible monitoring expectations

Constraints:
- Keep this repo-specific and operational.
- Do not rewrite the app architecture.
- Tie every runbook to actual diagnostics/support surfaces already present in the codebase.

Validate by:
- checking docs against the current support diagnostics outputs
- ensuring all prior phase validation commands remain accurate
