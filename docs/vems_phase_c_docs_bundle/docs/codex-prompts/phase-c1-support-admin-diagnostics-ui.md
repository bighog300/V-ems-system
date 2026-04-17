# Phase C1 Support/Admin Diagnostics UI — Codex Execution Prompt

Read first, in this order:
1. docs/phase-c/00-phase-c-roadmap.md
2. matching workstream doc in docs/phase-c/
3. docs/specs/*
4. docs/build-pack/*
5. docs/AI-HANDOFF.md
6. START_HERE.md

Rules:
- keep changes explicit and incremental
- preserve existing backend contracts where possible
- keep UIs backend-driven and read-oriented unless the doc explicitly requires otherwise
- do not expose secrets or unsafe internals
- add tests for new behavior
- do not regress current bootstrap/start/smoke/test flows


Implement the support/admin diagnostics UI using the existing diagnostics endpoint.

Tasks:
- add a UI surface/page for support/admin diagnostics
- render readiness summary, metrics summary, sync totals/failures, and upstream validation state
- keep the page read-only and support-oriented
- respect RBAC-aware visibility in UI where practical
- add frontend tests for rendering and empty/error states

Definition of done:
- diagnostics UI exists
- it uses GET /api/support/diagnostics
- it is safe/read-only
- tests pass


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
