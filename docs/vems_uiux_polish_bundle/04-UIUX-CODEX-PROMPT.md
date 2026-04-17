# Codex Prompt — UI/UX Polish Pass

Use this prompt from the repo root.

```text
You are working inside the VEMS monorepo.

Focus only on the frontend under apps/web-control.

Read these docs first:
- docs/02-UIUX-POLISH-EXECUTION-BRIEF.md
- docs/03-PRODUCTION-READY-UX-CHECKLIST.md

Goal:
Complete a production-ready UX polish pass for the frontend without redesigning domain workflows.

Priorities:
1. Accessibility improvements
2. Clearer information hierarchy on the main page
3. Better loading/error/empty states
4. Cleaner production-mode presentation with debug controls hidden
5. Consistent time formatting
6. Styling polish and narrower-screen resilience

Primary files to inspect:
- apps/web-control/src/index.html
- apps/web-control/src/styles.css
- apps/web-control/src/main.mjs
- apps/web-control/src/board.mjs
- apps/web-control/src/crew.mjs
- apps/web-control/src/summary.mjs
- apps/web-control/src/supervisor.html
- apps/web-control/src/logistics.html
- apps/web-control/src/diagnostics.html

Constraints:
- Make the smallest high-confidence changes.
- Do not redesign the app or backend contracts.
- Preserve auth/security behavior already implemented.
- Update tests for any changed markup or behavior.
- End only when apps/web-control tests pass.

Required output:
1. UX polish status: Complete or Partial, with exact reason
2. Files changed
3. Commands run
4. Test results
5. Remaining UX risks, if any
```
