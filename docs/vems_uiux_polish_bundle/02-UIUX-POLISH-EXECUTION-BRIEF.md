# UI/UX Polish Execution Brief for Codex

## Objective
Complete a production-ready UX polish pass for the frontend under `apps/web-control` without redesigning the EMS workflows.

## Scope
Focus on P2 productization and UX quality:
- accessibility improvements
- clearer information hierarchy
- reduced debug-style exposure in production
- consistent time formatting
- main-page simplification and clearer role separation
- friendlier empty/loading/error states

## Primary files
- `apps/web-control/src/index.html`
- `apps/web-control/src/styles.css`
- `apps/web-control/src/main.mjs`
- `apps/web-control/src/board.mjs`
- `apps/web-control/src/crew.mjs`
- `apps/web-control/src/summary.mjs`
- `apps/web-control/src/supervisor.html`
- `apps/web-control/src/logistics.html`
- `apps/web-control/src/diagnostics.html`

## Constraints
- Keep changes incremental and high-confidence.
- Do not redesign domain workflows or backend contracts.
- Preserve security fixes and auth behavior already implemented.
- Prefer clarity over visual complexity.
- Update tests when behavior or markup contracts change.

## Desired result
A frontend that feels operational and production-ready rather than like an internal harness, while keeping the current architecture intact.
