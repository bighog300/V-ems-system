# Codex Validation Runbook — P0, P1, P2

This runbook defines the checks Codex must perform before declaring the work complete.

## 1. Install and workspace validation
From repo root:

```bash
npm install
```

Success criteria:
- install completes without requiring a system `sqlite3` binary,
- lockfile and workspace manifests are updated if dependencies change.

## 2. Test suite
From repo root:

```bash
npm test
```

Success criteria:
- all workspace tests pass,
- no syntax error in the web-control diagnostics module,
- orchestration tests run using the new DB runtime dependency.

## 3. Static file traversal validation
Codex must verify that requests similar to the following cannot escape the root:
- `/../package.json`
- `/%2e%2e/%2e%2e/package.json`
- nested encoded traversal payloads

Expected result:
- request is rejected or treated as not found,
- no file outside the intended web root is served.

## 4. RBAC validation
Codex must validate sensitive GET endpoints under both allowed and denied roles.

At minimum validate:
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `GET /api/incidents/:id/patient-link`
- `GET /api/incidents/:id/encounters`
- `GET /api/encounters/:id/interventions`
- `GET /api/encounters/:id/handover`

Expected behavior:
- with enforcement enabled, unauthorized roles receive `403`,
- authorized roles succeed when the underlying resource exists,
- error envelope shape remains consistent.

## 5. Request body protection validation
Codex must add or run tests covering:

### Wrong content type
Example:
- `Content-Type: text/plain` on a JSON write endpoint

Expected:
- `415 Unsupported Media Type`

### Oversized body
Example:
- payload larger than configured maximum

Expected:
- `413 Payload Too Large`

### Malformed JSON
Example:
- broken JSON body with `Content-Type: application/json`

Expected:
- `400` with existing invalid payload error semantics

## 6. Public ID generation validation
Codex must verify that the new ID strategy is collision-safe.

Minimum acceptable proof:
- tests showing ID generation does not depend on `MAX(...) + 1`,
- tests or logic demonstrating uniqueness under rapid successive creates,
- stable external formatting preserved where practical.

## 7. Documentation validation
Codex must confirm:
- `README.md`, `START_HERE.md`, and `docs/README.md` do not reference absent directories as if they are implemented,
- commands documented in those files exist in `package.json` or `scripts/`,
- local development instructions reflect current behavior.

## 8. Final response requirements
Before finishing, Codex must provide:
- concise implementation summary,
- exact files changed,
- exact commands run,
- test status,
- any unresolved risks.
