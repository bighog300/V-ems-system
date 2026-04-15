# Build Tasks

## Phase 1 - Foundations
- [ ] Initialize monorepo and workspace tooling
- [ ] Add shared configuration package
- [ ] Add shared type definitions package
- [ ] Add linting, formatting, and test tooling
- [ ] Add Docker Compose for local dev services

## Phase 2 - Backend Skeleton
- [ ] Create api-gateway service skeleton
- [ ] Create orchestration service skeleton
- [ ] Create vtiger-adapter skeleton
- [ ] Create openemr-adapter skeleton
- [ ] Create sync-worker skeleton
- [ ] Create auth-service skeleton

## Phase 3 - Incidents and Assignments
- [ ] Implement POST /api/incidents
- [ ] Implement GET /api/incidents/{incidentId}
- [ ] Implement PATCH /api/incidents/{incidentId}
- [ ] Implement POST /api/incidents/{incidentId}/assignments
- [ ] Implement PATCH /api/assignments/{assignmentId}
- [ ] Add state transition guards for Incident and Assignment

## Phase 4 - Patient and Encounter Flows
- [ ] Implement POST /api/patients/search
- [ ] Implement POST /api/patients
- [ ] Implement POST /api/incidents/{incidentId}/patient-link
- [ ] Implement POST /api/incidents/{incidentId}/encounters
- [ ] Implement encounter state machine wiring

## Phase 5 - Stock and Support Flows
- [ ] Implement POST /api/stock/usage
- [ ] Add stock threshold event handling
- [ ] Add readiness and maintenance persistence scaffolds

## Phase 6 - Frontend MVP
- [ ] Build web-control shell
- [ ] Build call handler console
- [ ] Build dispatcher board
- [ ] Build incident detail screen
- [ ] Build crew mobile shell
- [ ] Build crew job list
- [ ] Build patient search/create flow
- [ ] Build assessment, intervention, and handover screens

## Phase 7 - Integration and QA
- [ ] Add contract tests for internal API
- [ ] Add Vtiger adapter integration tests
- [ ] Add OpenEMR adapter integration tests
- [ ] Add end-to-end incident-to-handover test
- [ ] Add retry/dead-letter tests
