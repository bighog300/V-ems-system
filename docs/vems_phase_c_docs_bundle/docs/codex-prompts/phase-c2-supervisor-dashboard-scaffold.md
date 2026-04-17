# Phase C2 Supervisor Dashboard Scaffold — Codex Execution Prompt

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


Implement a read-oriented supervisor dashboard scaffold.

Tasks:
- add a supervisor dashboard page/view
- show delayed/aging incidents, closure-blocked incidents, sync-failure-oriented health indicators, and useful counts
- use existing endpoints first
- if a backend read-model gap blocks delivery, document it explicitly or add the smallest justified read-model

Definition of done:
- supervisor dashboard scaffold exists
- it is useful for operational oversight
- tests pass


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
