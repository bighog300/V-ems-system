# Task Breakdown

## A. Smoke path design
Extend the smoke path so there are two intentional modes:
1. core smoke without upstreams
2. integration smoke with vtiger enabled

Required outcomes:
- each mode is documented
- failure of integration smoke clearly points to vtiger/auth/connectivity rather than generic API failure
- smoke output is concise and actionable

## B. VEMS→vtiger integration test cases
Add tests for at least:
- creating a vtiger-bound sync intent from a VEMS action
- worker processing it successfully
- worker classifying vtiger auth failure correctly
- worker classifying timeout/transient failure as retryable
- diagnostics showing the resulting status

## C. Diagnostics UI verification
Extend tests in:
- `apps/web-control/test/logistics.test.mjs`
- `apps/web-control/test/supervisor.test.mjs`
- diagnostics-related tests

Required outcomes:
- vtiger failure states render clearly
- recent failed intents show vtiger as target
- failures-by-target summaries remain accurate

## D. Operator smoke instructions
Add a short runbook for manually proving:
- vtiger reachable and auth works
- VEMS creates a vtiger-bound intent
- worker processes it
- diagnostics show healthy or failed state appropriately
