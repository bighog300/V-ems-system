# AI Handoff Document — Ambulance Platform

## Mission
Continue building an ambulance service platform integrating:
- Vtiger (operational)
- OpenEMR (clinical)
- Custom platform (UI + orchestration)

## Core Rules
- Vtiger = operational source of truth
- OpenEMR = clinical source of truth
- Incident ID = cross-system anchor

## Architecture
Backend:
- API Gateway
- Orchestration Service
- Vtiger Adapter
- OpenEMR Adapter
- Sync Worker
- Auth Service

Frontend:
- Web Control
- Mobile Crew App
- Supervisor Dashboard
- Logistics Dashboard

## Build Order
1. Foundations
2. Backend skeleton
3. Core workflows
4. Clinical integration
5. Logistics
6. Frontend
7. QA

## Constraints
- Do not invent new states
- Do not duplicate clinical data
- Enforce state machines
- Use correlation IDs
- Implement retries + audit logs

## Definition of Done
- API matches OpenAPI
- State transitions enforced
- Events emitted
- Tests pass

## Success Criteria
- Full incident lifecycle works
- Crew workflow works
- Patient + encounter flows work
- Stock tracking works
