# Codex Prompt — Phase 1

You are working in the VEMS monorepo.

Goal: finish Phase A baseline stabilization using the existing implementation rather than redesigning the product.

Constraints:
- Keep the current service layout.
- Do not introduce new frameworks.
- Prefer targeted edits in `apps/web-control` and related tests.
- Keep backend contracts compatible unless a test proves a necessary change.
- Do not broaden scope into supervisor/logistics/product redesign.

Focus files:
- `apps/web-control/src/board.mjs`
- `apps/web-control/src/main.mjs`
- `apps/web-control/src/crew.mjs`
- `apps/web-control/src/summary.mjs`
- `apps/web-control/src/workflow-actions.mjs`
- `apps/web-control/src/api.mjs`
- related tests under `apps/web-control/test`
- `packages/shared/src/state-machine.mjs` if central normalization helps

Deliver:
1. Dispatcher filtering and predictable board refresh.
2. Clear crew next-step / blocked-step messaging.
3. Stable close-flow UX.
4. New or improved tests for those paths.
5. A short implementation note in the phase PR or commit summary describing:
   - changed files
   - test coverage added
   - any remaining UX gaps

Validate with:
```bash
npm run test -w @vems/web-control
npm run test -w @vems/api-gateway
npm run init-db
npm run start:env
npm run smoke
```
