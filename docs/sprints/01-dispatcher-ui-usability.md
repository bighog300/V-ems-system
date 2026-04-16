# Sprint 1 — Dispatcher & UI Usability

## Goal
Make the dispatcher UI efficient enough for real operational use.

## Scope
- Dispatcher board filtering
- Dispatcher board sorting
- Dispatcher board live refresh/polling
- Improved visual priority/status clarity
- Better incident detail operational readability

## Tasks
- Add filtering controls:
  - active only
  - status
  - priority
- Add sorting controls:
  - priority
  - recency
- Add polling/live refresh to dispatcher board
- Add stronger status/priority badges and visual emphasis
- Improve incident detail layout clarity for operators

## Acceptance Criteria
- Dispatcher can filter incidents by active/status/priority
- Dispatcher can sort incidents meaningfully
- Board auto-refreshes safely
- Critical incidents are easier to identify visually
- Existing tests still pass
- New UI tests cover filter/refresh behavior where practical

## Non-goals
- No new backend write workflows
- No websocket implementation
- No major redesign of component architecture
