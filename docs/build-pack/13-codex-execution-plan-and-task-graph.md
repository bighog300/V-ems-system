# 13 - Codex Execution Plan and Task Graph

## Execution strategy
1. Specs and contracts first
2. Shared code and infrastructure second
3. Backend service skeletons third
4. Core incident/dispatch workflows fourth
5. Patient/clinical integration fifth
6. Stock, readiness, and maintenance sixth
7. Frontends seventh
8. Testing and hardening last

## Dependency graph summary
### Layer A - Foundations
- import docs/specs into repo
- initialize monorepo
- configure workspace tooling
- configure linting/testing/formatting
- configure env and config package

### Layer B - Shared Contracts
- implement shared types from specs
- implement constants and enum packages
- implement validation schemas
- implement state machine loader/helpers

### Layer C - Backend Skeletons
- api-gateway skeleton
- orchestration skeleton
- vtiger-adapter skeleton
- openemr-adapter skeleton
- sync-worker skeleton
- auth-service skeleton

### Layer D - Core Operational Domain
- incident module
- assignment module
- incident workflow guards
- audit logging
- event publishing

### Layer E - Clinical Integration
- patient search/create orchestration
- patient link persistence
- encounter creation flow
- observations/interventions/handover endpoints
- clinical summary backflow to incident
