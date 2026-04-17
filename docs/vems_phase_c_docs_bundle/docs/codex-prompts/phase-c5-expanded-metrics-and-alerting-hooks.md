# Phase C5 Expanded Metrics and Alerting Hooks — Codex Execution Prompt

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


Implement expanded metrics and alerting hooks.

Tasks:
- add additional counters for operationally useful conditions
- add threshold/alert-hook-ready structures without introducing heavy dependencies
- surface the most useful new counters in diagnostics/metrics where appropriate
- add tests for increment behavior and exposure

Definition of done:
- expanded counters exist
- alert-ready hooks or structures exist
- tests pass


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
