# Codex Execution Brief — Fix P0, P1, and P2

## Scope
This document defines the implementation scope Codex must execute in this repository to resolve the previously identified priority issues:

- **P0**
  - Fix frontend diagnostics syntax error.
  - Remove orchestration dependence on the external `sqlite3` CLI.
  - Fix static file path traversal risk in the web server.
- **P1**
  - Enforce RBAC on sensitive read endpoints.
  - Add request body size limits and JSON content-type enforcement.
  - Replace race-prone ID generation with collision-safe generation.
- **P2**
  - Align README and startup docs with the repository as it actually exists.
  - Improve local setup, CI assumptions, and contributor guidance.

## Repository reality
Codex must work against the repo as it exists now, not against older planning docs.

Observed key paths:
- `apps/web-control/src/diagnostics.mjs`
- `apps/web-control/src/server.mjs`
- `services/orchestration/src/db.mjs`
- `services/orchestration/src/`
- `services/api-gateway/src/server.mjs`
- `README.md`
- `START_HERE.md`
- `docs/README.md`
- `package.json`
- `scripts/`

## Non-goals
Codex must not perform unrelated refactors. Avoid broad architectural churn unless needed to complete the scoped fixes. Do not redesign product behavior, API semantics, or workflow states.

## Mandatory implementation requirements

### 1) Fix frontend diagnostics syntax error
**File:** `apps/web-control/src/diagnostics.mjs`

#### Problem
`buildDiagnosticsSections()` contains a malformed ternary branch for `upstream`, causing the module to fail parsing.

#### Required outcome
- The module must parse successfully.
- Existing diagnostics tests must load and run.
- Preserve current output shape unless a test requires a more precise shape.

#### Expected correction pattern
The `upstream` branch must be completed so it resolves to either an object or `null`, for example:
- `upstream: upstream ? { ... } : null`

Codex should preserve the property names already used elsewhere:
- `enabled`
- `lastValidation`

### 2) Replace `sqlite3` shell-out DB access with a runtime dependency
**Files:**
- `services/orchestration/src/db.mjs`
- possibly `services/orchestration/package.json`
- related tests under `services/orchestration/test/`

#### Problem
The DB client shells out to `sqlite3` via `execFileSync`. This breaks in environments where the binary is not installed and makes tests non-portable.

#### Required outcome
- The orchestration service must use a Node-level SQLite dependency instead of invoking the `sqlite3` executable.
- Tests must pass on a fresh machine after `npm install`, without requiring a system `sqlite3` binary.
- Schema bootstrap must still work.
- Existing persistence behavior must remain functionally equivalent.

#### Implementation guidance
Codex may choose a maintained Node SQLite package already suitable for synchronous or simple transactional use. The simplest acceptable path is:
- introduce a package dependency in the orchestration workspace,
- replace raw shell command execution with direct library calls,
- keep SQL statements and schema logic intact where possible.

#### Constraints
- Avoid rewriting the orchestration domain layer.
- Preserve current repository APIs as much as possible.
- Preserve or improve test determinism.

### 3) Fix path traversal in static file serving
**File:** `apps/web-control/src/server.mjs`

#### Problem
The server currently joins a request path to the web root without verifying the resolved path stays within the intended root.

#### Required outcome
- Requests must only be able to serve files inside the intended web root.
- Path normalization and decoding must not allow escaping the root.
- Requests for invalid paths must return 404 or 403.

#### Implementation guidance
Codex should:
- use `resolve()` rather than trusting `join()` alone,
- normalize the request path,
- compute an absolute root path,
- reject any resolved path not under that root,
- continue to serve `/` as `index.html`.

### 4) Enforce RBAC for sensitive read endpoints
**File:** `services/api-gateway/src/server.mjs`

#### Problem
Many sensitive GET endpoints are readable without an RBAC policy match.

#### Required outcome
Add explicit RBAC coverage for at least these read routes if present:
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `GET /api/incidents/:id/patient-link`
- `GET /api/incidents/:id/encounters`
- `GET /api/encounters/:id/interventions`
- `GET /api/encounters/:id/handover`

#### Policy guidance
Use least-privilege rules consistent with the existing role model. A practical baseline:
- operational read access: `dispatcher`, `supervisor`, `operations_manager`, `sys_admin`
- clinical/crew read access where clinically needed: `field_crew`, `field_crew_lead`, `clinical_reviewer`, `supervisor`, `sys_admin`

Codex must inspect current route purposes and assign roles conservatively. Do not leave sensitive reads unprotected.

### 5) Add request size limits and strict JSON request validation
**File:** `services/api-gateway/src/server.mjs`

#### Problem
`parseJson(req)` accepts unlimited body size and does not strictly enforce JSON content type.

#### Required outcome
For JSON write endpoints:
- reject unsupported content types with `415 Unsupported Media Type`,
- reject oversized bodies with `413 Payload Too Large`,
- preserve existing `400` behavior for malformed JSON,
- maintain existing error envelope shape.

#### Implementation guidance
- Introduce a maximum payload size constant.
- Check `content-type` before reading request bodies on methods that expect JSON.
- Track byte length while streaming request chunks.
- Fail early once the limit is exceeded.

### 6) Replace `MAX(...) + 1` identifier generation
**Files:** inspect orchestration repositories and any helpers that create IDs such as:
- `INC-000001`
- `ASN-000001`
- encounter and related IDs

#### Problem
ID generation based on current max values is race-prone under concurrent writes.

#### Required outcome
- ID generation must be collision-safe under concurrent writes.
- Existing external ID formats should remain stable if practical.

#### Acceptable approaches
Preferred:
- use database-generated integer primary keys plus a deterministic formatted public ID,
- or use UUID-based storage IDs with preserved public display IDs,
- or use a dedicated sequence table / transactional counter.

Codex should favor the least disruptive design that preserves current API outputs.

### 7) Align docs and startup guidance with reality
**Files:**
- `README.md`
- `START_HERE.md`
- `docs/README.md`
- optionally `TASKS.md`

#### Required outcome
- State the actual prerequisites.
- State the actual startup commands.
- Stop claiming directories or infrastructure that are not present.
- Specify the intended Node/npm version range if inferable from the project.
- Document whether the stack is script-driven, workspace-driven, or Docker-driven.
- Clarify that current auth is header-based development auth unless changed as part of this scope.

## Definition of done
Codex is complete only when all of the following are true:
- `npm test` passes from repo root.
- No service requires a system `sqlite3` binary.
- Static file traversal is blocked.
- Sensitive read endpoints are RBAC-protected.
- Oversized and wrong-content-type JSON requests fail correctly.
- ID generation is no longer race-prone.
- README and docs reflect the actual repository.

## Deliverables
Codex must produce:
1. Code changes in the repo.
2. Updated tests.
3. Updated documentation.
4. A concise final change summary listing:
   - files changed,
   - key behavior changes,
   - remaining risks or follow-ups.
