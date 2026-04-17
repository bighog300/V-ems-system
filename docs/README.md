# Documentation Index

This directory contains product specs, build artifacts, ops notes, and sprint planning documents.

## Recommended reading order for implementation work

1. `specs/README.md`
2. `specs/openapi.yaml`
3. `specs/state-machines.yaml`
4. `specs/canonical-data-model.yaml`
5. `specs/event-contracts.yaml`
6. `build-pack/README.md` (design/implementation context)

## Key folders

- `specs/` — machine-readable contracts (API/data/state/event/env).
- `build-pack/` — architecture/design documentation.
- `ops/` — upstream system + operational runbooks.
- `sprints/` — sprint-level execution objectives.
- `codex-prompts/` — prompt artifacts aligned to the sprint docs.
- `root-legacy/` — archived legacy source docs.

## Development reality notes

- The active code lives in top-level `apps/`, `services/`, and `packages/`.
- Local startup/testing is script + npm-workspace based (see root `README.md`).
- Current API auth context is header-based for development, with optional RBAC enforcement via environment flags.
