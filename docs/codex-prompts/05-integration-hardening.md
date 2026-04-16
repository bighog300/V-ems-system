# Sprint 5 — Codex Execution Prompt

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


Implement Sprint 5: Integration Hardening.

Tasks:
- harden real adapter auth/config behavior
- add connectivity validation
- improve sync visibility/debugging
- preserve offline-safe tests where possible

Definition of done:
- adapters are closer to real upstream execution
- sync failures are diagnosable
- npm test passes


Return:
1. summary
2. files changed
3. blockers/assumptions
4. next smallest useful step
