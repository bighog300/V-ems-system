# Issue 3 Validation Runbook

## Core validation
The final implementation must prove that orchestration DB access no longer depends on `sqlite3` CLI.

## Suggested checks

### 1. Code check
Confirm that:
- `services/orchestration/src/db.mjs` contains no `exec`, `spawn`, or `sqlite3` CLI execution path used for DB operations

### 2. Runtime check
Run orchestration-focused tests in an environment without requiring `sqlite3` CLI.

Suggested commands:
```bash
npm run test --workspace @vems/orchestration
npm test
```

### 3. Behavior check
Verify:
- migrations still apply
- repositories still function
- transaction semantics still behave as expected for the repo's current usage
- backup/restore docs still match reality

### 4. Completion criteria
Do not mark Issue 3 closed until:
- no shell-out DB path remains
- tests pass
- docs match implementation
