# Phase C4 Backup and Recovery Scripts + Checklist — Codex Execution Prompt

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


Implement backup/recovery foundations.

Tasks:
- add backup script(s) for platform-local state
- add a restore helper or documented restore path
- add backup/recovery checklist docs
- keep scripts safe, explicit, and simple
- validate script syntax and safe execution paths

Definition of done:
- backup script exists
- restore path exists in docs or script form
- checklist exists in repo
- tests/syntax validation pass


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
