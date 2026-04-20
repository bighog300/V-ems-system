# Task Breakdown

## A. Performance targets
Required work:
1. Define explicit expectations for:
   - latency on incident creation / core reads
   - acceptable error rate
   - sync worker backlog tolerance
   - concurrent operator usage assumptions
2. Add these to docs so "performance-ready" is measurable.

## B. Load testing
Inspect:
- `scripts/load-test-api.mjs`
- metrics route used by that script
- API health during test execution

### Required changes
1. Make the load script output useful summary artifacts or stable structured output.
2. Document how to run small/medium load runs.
3. Confirm the script can exercise the critical API path repeatedly without unsafe side effects beyond intended test data generation.
4. Add guidance for cleaning test data if necessary.

## C. Release gating
Update:
- `.github/workflows/ci.yml`
- release docs/scripts as needed

### Required changes
1. Define required checks before merge/release:
   - lint
   - unit/integration tests
   - smoke or equivalent environment verification where feasible
   - security checks from Phase 3
2. Ensure a failed critical check blocks promotion.

## D. Cutover and rollback
Create docs for:
- staging signoff
- production deployment order
- smoke-after-deploy
- rollback triggers
- rollback commands/steps
- post-release monitoring window
