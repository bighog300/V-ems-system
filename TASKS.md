# Build Tasks

> **Superseded.** This checklist covered Phases 1–7 of the original backend/frontend
> skeleton and was never kept in sync with actual progress (every box below was still
> unchecked while most of this work had already shipped). Current status and the live
> roadmap now live in [`docs/EPCR_MOBILE_COMPLETION_PLAN.md`](docs/EPCR_MOBILE_COMPLETION_PLAN.md)
> and tracking issue [#72](https://github.com/bighog300/v-ems-system/issues/72).
>
> Summary: Phases 1–7 below (monorepo foundations, backend service skeletons, incident/
> assignment/patient/encounter APIs, stock flows, dispatcher/crew UI, integration tests)
> are done. Work has since moved on to ePCR Stages 6–14 (multi-patient cases, complete
> clinical record, signatures/QA, native mobile app, offline sync, production
> infrastructure, compliance/reporting, field validation) — see the completion plan for
> current state.

## Phase 1 - Foundations
- [x] Initialize monorepo and workspace tooling
- [x] Add shared configuration package
- [x] Add shared type definitions package
- [x] Add linting, formatting, and test tooling
- [x] Add Docker Compose for local dev services

## Phase 2 - Backend Skeleton
- [x] Create api-gateway service skeleton
- [x] Create orchestration service skeleton
- [x] Create vtiger-adapter skeleton
- [x] Create openemr-adapter skeleton
- [x] Create sync-worker skeleton
- [x] Create auth-service skeleton

## Phase 3 - Incidents and Assignments
- [x] Implement POST /api/incidents
- [x] Implement GET /api/incidents/{incidentId}
- [x] Implement PATCH /api/incidents/{incidentId}
- [x] Implement POST /api/incidents/{incidentId}/assignments
- [x] Implement PATCH /api/assignments/{assignmentId}
- [x] Add state transition guards for Incident and Assignment

## Phase 4 - Patient and Encounter Flows
- [x] Implement POST /api/patients/search
- [x] Implement POST /api/patients
- [x] Implement POST /api/incidents/{incidentId}/patient-link
- [x] Implement POST /api/incidents/{incidentId}/encounters
- [x] Implement encounter state machine wiring

## Phase 5 - Stock and Support Flows
- [x] Implement POST /api/stock/usage
- [x] Add stock threshold event handling
- [x] Add readiness and maintenance persistence scaffolds

## Phase 6 - Frontend MVP
- [x] Build web-control shell
- [x] Build call handler console
- [x] Build dispatcher board
- [x] Build incident detail screen
- [x] Build crew mobile shell
- [x] Build crew job list
- [x] Build patient search/create flow
- [x] Build assessment, intervention, and handover screens

## Phase 7 - Integration and QA
- [x] Add contract tests for internal API
- [x] Add Vtiger adapter integration tests
- [x] Add OpenEMR adapter integration tests
- [x] Add end-to-end incident-to-handover test
- [x] Add retry/dead-letter tests

## What's next

See [`docs/EPCR_MOBILE_COMPLETION_PLAN.md`](docs/EPCR_MOBILE_COMPLETION_PLAN.md) for the
active roadmap (ePCR Stages 6–14). As of this update, Stages 6 and 7 are closed/merged;
Stages 8–14 (signatures/QA, native mobile app, offline sync, production infrastructure,
compliance/reporting, field validation) remain open — see issues #65–#71.
