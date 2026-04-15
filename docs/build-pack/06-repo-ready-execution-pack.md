# 06 - Repo-Ready Execution Pack

## Purpose
This document translates the system design into a repository-ready execution plan suitable for GitHub import and AI-assisted development.

## Recommended monorepo
- `apps/`
- `services/`
- `packages/`
- `infra/`
- `docs/`
- `tests/`

## Core services
- API Gateway
- Orchestration Service
- Vtiger Adapter
- OpenEMR Adapter
- Sync Worker
- Auth Service

## Frontend apps
- Web Control App
- Mobile Crew App
- Supervisor Dashboard
- Logistics Dashboard

## Custom database purpose
Store:
- cache data
- sync states
- audit logs
- internal events

## Suggested local tables
- incidents_cache
- patients_link
- encounters_link
- sync_events
- audit_log

## Implementation phases
1. Core Operations
2. Clinical Integration
3. Stock + Logistics
4. Advanced analytics and optimisation

## Definition of done
A feature is complete when:
- API implemented
- UI implemented
- permissions enforced
- tests pass
- audit logging works
- documentation updated
