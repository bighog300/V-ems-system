You are working inside the VEMS monorepo.

Read these docs first:
- docs/01-REMAINING-ISSUES-STATUS-MATRIX.md
- docs/02-CODEX-EXECUTION-BRIEF-REMAINING.md
- docs/03-CODEX-TASK-CHECKLIST-REMAINING.md
- docs/04-CODEX-VALIDATION-RUNBOOK-REMAINING.md

## Goal
Complete all remaining production-readiness items that are still partial or open.

## Issue IDs in scope
1, 2, 3, 4, 5, 6, 7, 11, 12, 15, 16

## Priority order
1. Issue 3 — replace orchestration DB shell-out runtime with a real non-CLI DB runtime
2. Issue 1 — production-suitable authentication and verified identity handling
3. Issue 2 — production-usable OpenEMR and Vtiger adapter behavior
4. Issue 4 — make Docker/runtime boot path self-starting and validation-ready
5. Issue 5 — concrete secret-injection model and fail-fast config handling
6. Issue 6 — complete backup/restore support for actual deployed DB mode
7. Issue 7 — centralize and harden authorization policy
8. Issue 11 — complete minimum production observability
9. Issue 12 — define and implement process supervision behavior
10. Issue 15 — add concrete TLS/ingress runtime artifacts
11. Issue 16 — operationalize governance/compliance docs

## Constraints
- Make the smallest high-confidence changes that close the issues.
- Do not redesign EMS domain workflows.
- Preserve existing public API contracts unless a remaining issue requires a change.
- Add or update tests for all practical code changes.
- Update docs to match the final implementation.
- End only when the repo test suite passes.

## Required output
At the end, provide:
1. Summary by issue ID with Closed / Partial / Open
2. Files changed
3. Commands run
4. Test results
5. Remaining risks, if any
