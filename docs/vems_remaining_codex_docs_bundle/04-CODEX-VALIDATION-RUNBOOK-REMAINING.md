# Codex Validation Runbook — Remaining Production Work

Use this runbook while implementing and before stopping.

## 1. Static checks
Run all repo quality gates that exist after your changes.

Suggested sequence:
```bash
npm run lint
npm test
```

If workspace-specific tests exist for changed areas, run them during development as well.

## 2. Authentication validation
Verify:
- valid token accepted
- invalid signature rejected
- expired token rejected
- invalid issuer rejected
- invalid audience rejected
- dev-mode path works only when explicitly enabled

## 3. Integration transport validation
Verify with tests and config-level checks:
- missing base URL fails clearly
- missing auth config fails clearly
- timeout behavior is deterministic
- 4xx and 5xx responses classify correctly
- retry-safe semantics are preserved

## 4. Database validation
Verify:
- orchestration DB no longer shells out to external `sqlite3`
- migrations apply in test environment
- repositories still pass tests
- no regression in startup path

## 5. Docker/runtime validation
If Docker is available:
```bash
docker compose -f infra/docker-compose.dev.yml --env-file <envfile> build
docker compose -f infra/docker-compose.dev.yml --env-file <envfile> up -d
bash scripts/health-check.sh
bash scripts/test-adapter-connections.sh
```

Expected outcome:
- images build
- containers start
- health checks pass
- init logic completes
- adapter connectivity checks are meaningful

If Docker is unavailable, ensure docs and scripts are still internally consistent and fail fast with clear messages.

## 6. Backup/restore validation
Verify:
- backup command works for supported DB mode
- restore command works for supported DB mode
- validation step confirms restored data accessibility

## 7. Observability validation
Verify:
- metrics endpoint or metrics output exists
- readiness/health signals are documented and reachable
- logs include request correlation where expected

## 8. Final completion criteria
Do not stop until:
- repo tests pass
- docs match implementation
- summary clearly states what was closed
- any residual risk is explicitly called out
