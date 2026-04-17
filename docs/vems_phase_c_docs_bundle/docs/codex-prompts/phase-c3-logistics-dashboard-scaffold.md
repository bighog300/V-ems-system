# Phase C3 Logistics Dashboard Scaffold — Codex Execution Prompt

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


Implement a read-oriented logistics dashboard scaffold.

Tasks:
- add a logistics dashboard page/view
- show stock-linked intervention summaries, stock sync health, and recent stock-related failures
- keep the scope visibility-first rather than workflow-heavy
- use existing enriched intervention/diagnostics data where possible

Definition of done:
- logistics dashboard scaffold exists
- stock sync outcomes are visible
- tests pass


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
