# 12 - Repository File Manifest and Starter Files

## Purpose
This document defines the exact repository file structure, starter file contents, and specification placement for importing the project into GitHub and using AI-assisted execution tools such as Codex.

## Key structure
- root workspace files
- docs/build-pack/
- docs/specs/
- apps/
- services/
- packages/
- db/
- infra/
- tests/

## Spec placement
| Source Document | Repo File |
|---|---|
| Build Pack | docs/build-pack/00-platform-build-pack.md |
| Data Handoff Matrix | docs/build-pack/01-data-handoff-matrix.md |
| Workflow Status Map | docs/build-pack/02-workflow-status-map.md |
| Role Permissions Matrix | docs/build-pack/03-role-permissions-matrix.md |
| API Integration Spec | docs/build-pack/04-api-integration-spec.md |
| UX Spec | docs/build-pack/05-screen-ux-spec.md |
| Repo Execution Pack | docs/build-pack/06-repo-ready-execution-pack.md |
| OpenAPI | docs/specs/openapi.yaml |
| Canonical Data Model | docs/specs/canonical-data-model.yaml |
| State Machines | docs/specs/state-machines.yaml |
| Event Contracts | docs/specs/event-contracts.yaml |
| Environment Config | docs/specs/environment-config.yaml |
