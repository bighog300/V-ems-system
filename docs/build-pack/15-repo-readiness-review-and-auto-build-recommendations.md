# 15 - Repository Readiness Review and Auto-Build Recommendations

## Scope reviewed
This review covered all currently committed documentation in:
- root-level build-pack placeholders (`00` to `06`, `12`, `13`, `14_17`)
- `README.md` and `TASKS.md`
- machine-readable contracts in `docs/specs/`
- expanded build docs in `docs/build-pack/`

## Executive readiness verdict
**Status: Partially ready for human-guided implementation, not yet ready for autonomous auto-build.**

The repository has strong architectural direction and mostly consistent core contracts, but it lacks required executable scaffolding and CI/CD guardrails needed for reliable autonomous generation and validation.

## What is already strong
1. **Clear contract-first intent**
   - OpenAPI, canonical data model, state machines, event contracts, and environment config are present under `docs/specs/`.
2. **Execution sequencing is defined**
   - `TASKS.md` and build-pack execution docs define phased delivery and dependency order.
3. **Hard constraints are explicit**
   - The upgrade pack establishes non-negotiables, golden path, and acceptance scenarios.
4. **Domain boundaries are explicit**
   - Vtiger vs OpenEMR ownership is repeatedly and consistently documented.

## Readiness gaps blocking auto-build

### A) Repository structure exists only as documentation
The docs describe directories (`apps/`, `services/`, `packages/`, `infra/`, `db/`, `tests/`), but these are not bootstrapped with runnable starter projects, manifests, build scripts, or workspace tooling.

**Impact:** AI agents cannot deterministically execute build/test commands because no canonical toolchain entrypoint is present.

### B) Duplicate documentation layers with drift risk
Root-level files like `00-platform-build-pack.md`, `06-repo-ready-execution-pack.md`, `12-repo-manifest.md`, and `13-codex-execution-plan.md` are placeholders, while full content exists under `docs/build-pack/`.

**Impact:** Automated systems may ingest placeholder files as authoritative and lose critical detail.

### C) Missing CI/CD automation baseline
No visible `.github/workflows/` pipeline, no spec validation workflow, and no contract-drift checks between OpenAPI/data model/state machine enums.

**Impact:** No automated gate prevents breaking contract changes or inconsistent generated code.

### D) Missing build reproducibility inputs
No workspace package manager configuration (`pnpm-workspace.yaml`, `package.json`, `turbo.json`/`nx.json`, etc.), no lockfiles, and no pinned runtime versions.

**Impact:** Autonomous runs are non-reproducible across environments.

### E) Missing environment/bootstrap artifacts
`docs/specs/environment-config.yaml` defines required vars, but there are no `.env.example`, secrets-loading policy, or local stack compose/k8s manifests.

**Impact:** Agents cannot reliably stand up integration-safe dev environments.

### F) Acceptance scenarios are not mapped to executable tests
Scenario-level acceptance exists in the upgrade pack but there is no test harness skeleton (contract tests, integration stubs, E2E runner, fixtures, or synthetic adapters).

**Impact:** Completion cannot be machine-verified.

## Recommended minimum additions for auto-build readiness

### 1) Establish canonical source policy (high priority)
- Mark `docs/specs/*` as source-of-truth contracts.
- Mark `docs/build-pack/*` as human guidance.
- Convert root placeholders into redirects to canonical paths or remove them.
- Add `CONTRACT_PRIORITY.md` at root with explicit precedence and links.

### 2) Bootstrap a deterministic monorepo skeleton (high priority)
Create minimal runnable skeleton with pinned toolchain versions:
- root workspace manifests
- shared config package
- shared types package
- service/app placeholders with `build`, `test`, `lint`, and `typecheck` scripts
- infra folder with local compose for postgres/redis/broker mocks

### 3) Add CI “contract gate” workflow (high priority)
Required checks on every PR:
- YAML lint + schema validation
- OpenAPI validation/lint (Spectral or equivalent)
- state machine schema validation
- event contract schema validation
- cross-contract consistency check (IDs, enums, statuses)
- generated type diff check (fail when generated artifacts stale)

### 4) Add CI “build gate” workflow (high priority)
Required checks:
- dependency install with lockfile
- `lint`, `typecheck`, `unit test` per workspace
- service/app build matrix
- artifacts upload for generated SDK/types

### 5) Add environment and secrets bootstrap (medium priority)
- `.env.example` per service
- centralized env validation on startup
- local secret strategy for dev (non-production)
- documented mapping from `environment-config.yaml` to runtime keys

### 6) Add acceptance test harness mapped to scenarios (high priority)
Create executable tests for scenarios 1–6 from the upgrade pack:
- feature tests for golden path
- failure-path tests (sync failure / DLQ)
- no-transport and stood-down branch tests
- ambiguous patient match guard tests

### 7) Add build orchestration commands (medium priority)
Standardize top-level commands, e.g.:
- `make bootstrap`
- `make validate-contracts`
- `make test-contract`
- `make test-integration`
- `make build-all`

### 8) Add CODEOWNERS and protected-branch gates (medium priority)
- enforce reviews on spec and workflow files
- block merge unless contract/build gates pass

## Suggested implementation sequence (auto-build focused)
1. Canonicalization + placeholder cleanup
2. Workspace/toolchain bootstrap
3. Contract validation pipeline
4. Service/app skeleton generation tied to OpenAPI/types
5. Integration stubs and local compose
6. Acceptance tests for scenarios 1–6
7. Hardening (security, observability, rollback)

## Practical definition of “auto-build ready”
Repository is auto-build ready when all are true:
1. Fresh clone can run bootstrap in one command.
2. CI can validate all specs and cross-contract consistency.
3. CI can build and test all workspaces deterministically.
4. Golden path acceptance test passes in CI.
5. Drift between specs and generated code is blocked by CI.
6. Required env vars are validated with clear startup errors.

## Quick pass/fail checklist
- [ ] Canonical doc/source-of-truth policy committed
- [ ] Root placeholders removed or redirected
- [ ] Monorepo manifests and lockfiles committed
- [ ] Local dev stack (`docker compose`) available
- [ ] Contract validation CI workflow active
- [ ] Build/test CI workflow active
- [ ] Acceptance scenario tests scaffolded and runnable
- [ ] Secrets/env bootstrap examples provided
- [ ] Branch protection tied to CI status checks

