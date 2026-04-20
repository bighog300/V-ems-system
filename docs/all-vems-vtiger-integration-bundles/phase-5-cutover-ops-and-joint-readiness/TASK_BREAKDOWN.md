# Task Breakdown

## A. Joint readiness criteria
Create a VEMS↔vtiger readiness checklist covering:
- vtiger build/version pinned
- VEMS auth/connectivity validated
- retry/backoff rules set
- diagnostics visible
- backup/restore assumptions documented
- cutover steps and rollback triggers defined

## B. Runbooks
Add concise runbooks for:
- vtiger unavailable at startup
- vtiger auth failure after credential rotation
- repeated vtiger dead-letter growth
- vtiger recovered and intents need replay
- VEMS deployment rollback when vtiger integration is unstable

## C. Monitoring expectations
Define what operators should watch on the VEMS side:
- `failures_by_target.vtiger`
- pending retries targeting vtiger
- dead-lettered vtiger intents
- support alert states related to failure rate and latency
- last successful upstream validation

## D. Release/cutover flow
Document a safe rollout order:
1. validate vtiger repo/image/version
2. validate VEMS connectivity/auth
3. run integration smoke
4. deploy VEMS changes
5. run post-deploy smoke
6. monitor for dead-letter/retry anomalies
