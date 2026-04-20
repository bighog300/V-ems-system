# Task Breakdown

## A. Dispatcher board completion
Work inside:
- `apps/web-control/src/board.mjs`
- `apps/web-control/src/main.mjs`
- `apps/web-control/src/index.html`
- `apps/web-control/src/styles.css`
- related tests in `apps/web-control/test/board.test.mjs` and `main.dispatcher-dom.test.mjs`

### Required changes
1. Add filtering controls for:
   - priority
   - open/closed
   - text search by incident ID or location
   - optionally "unassigned only" if it fits the current DOM structure
2. Ensure item grouping already implied by `urgencyGroup` is surfaced clearly in the rendered board.
3. Implement predictable live refresh:
   - use an interval
   - avoid duplicate concurrent fetches
   - preserve the selected incident when refreshed if still present
   - visibly indicate refresh failures without blowing away previously loaded data
4. Improve empty state:
   - no incidents
   - filter returned no matches
   - API unavailable

## B. Crew-flow completion
Work inside:
- `apps/web-control/src/crew.mjs`
- `apps/web-control/src/summary.mjs`
- `apps/web-control/src/workflow-actions.mjs`
- `apps/web-control/src/api.mjs`

### Required changes
1. Make "what happens next" obvious from the UI.
2. Explicitly show blocked states and why:
   - patient not linked
   - encounter not created
   - handover not completed
   - incident not yet close-ready
3. Avoid duplicate submissions for crew actions.
4. Keep wording aligned with backend flags such as `closure_ready`.

## C. Status normalization
Check drift between:
- `packages/shared/src/state-machine.mjs`
- API payloads from `services/api-gateway`
- UI comparisons using normalized lowercase values in `board.mjs`, `crew.mjs`, `summary.mjs`

### Required changes
- normalize comparisons centrally where possible
- avoid UI logic depending on inconsistent capitalization
- do not change stable API contracts without a strong reason

## D. Tests
Add or extend tests in:
- `apps/web-control/test/board.test.mjs`
- `apps/web-control/test/crew.test.mjs`
- `apps/web-control/test/main.dispatcher-dom.test.mjs`
- `apps/web-control/test/summary.test.mjs`

### Minimum expected coverage
- filtering reduces the board correctly
- live refresh preserves selection when possible
- crew UI reflects blocked progression correctly
- close-flow panel behaves correctly for:
  - already closed
  - not ready to close
  - ready to close
