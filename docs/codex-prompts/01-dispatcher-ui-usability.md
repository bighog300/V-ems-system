# Sprint 1 — Codex Execution Prompt

Read first, in this order:
1. docs/specs/*
2. docs/build-pack/*
3. docs/AI-HANDOFF.md
4. START_HERE.md
5. docs/sprints/00-roadmap-overview.md
6. matching sprint doc in docs/sprints/

Rules:
- Do not invent new workflow states or backend contracts
- Keep frontend thin and backend-driven
- Preserve structured error behavior
- Keep implementation explicit and modular
- Add tests for new behavior
- Do not regress existing passing flows


Implement Sprint 1: Dispatcher & UI Usability.

Tasks:
- add dispatcher board filtering (active/status/priority)
- add sorting (priority/recency)
- add simple polling/live refresh
- improve visual emphasis for priority and closure readiness
- keep existing board/detail behavior intact

Definition of done:
- dispatcher board is more usable under multi-incident conditions
- filters and sorting work
- board refreshes automatically
- npm test passes


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
