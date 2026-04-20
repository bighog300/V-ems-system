# Phase 1 — Baseline Stabilization

## Objective
Complete **Phase A** for the existing repo by stabilizing the dispatcher board, crew workflow, and close-flow UX around the already-implemented core services:

- `services/api-gateway`
- `services/orchestration`
- `apps/web-control`
- `packages/shared`

This phase is not about adding new platform surfaces. It is about making the current functional core consistently usable.

## Repo reality this bundle is based on
The repo already contains:
- dispatcher/operator UI in `apps/web-control/src/board.mjs`, `main.mjs`, `summary.mjs`, `workflow-actions.mjs`
- crew workflow UI in `apps/web-control/src/crew.mjs`
- API tests including `services/api-gateway/test/incident-closure.golden-path.e2e.test.mjs`
- orchestration and persistence in `services/orchestration/src/index.mjs` and `src/db.mjs`
- shared state definitions in `packages/shared/src/state-machine.mjs`
- roadmap notes saying remaining Phase A items are filtering, refresh, polish, and UI integration tests

## Exact scope
1. Finish dispatcher filtering and live refresh.
2. Tighten dispatcher card grouping and incident detail behavior.
3. Tighten crew progression clarity and invalid-state handling.
4. Add or complete UI integration tests for close-flow and crew-flow.
5. Standardize status handling between UI and backend payloads where drift exists.

## Files to inspect first
- `docs/PHASE_A_MVP.md`
- `docs/roadmap.md`
- `apps/web-control/src/board.mjs`
- `apps/web-control/src/crew.mjs`
- `apps/web-control/src/summary.mjs`
- `apps/web-control/src/workflow-actions.mjs`
- `apps/web-control/src/api.mjs`
- `apps/web-control/test/*.test.mjs`
- `services/api-gateway/test/incident-closure.golden-path.e2e.test.mjs`
- `packages/shared/src/state-machine.mjs`

## Deliverables
- Better dispatcher workflow in the existing UI
- Better crew-flow guidance in the existing UI
- Passing UI-focused tests for the critical end-to-end workflow
- No speculative new dashboard surfaces

## Primary commands
```bash
npm install
npm test
npm run init-db
npm run start:env
npm run smoke
npm run test -w @vems/web-control
npm run test -w @vems/api-gateway
```

## Completion gate
This bundle is complete only when:
- the dispatcher can find active incidents quickly
- the board auto-refreshes or refreshes on a predictable interval without confusing state drift
- the crew flow clearly indicates next actions and blocked actions
- close-flow behavior is covered by tests
- smoke still passes after the UI changes
