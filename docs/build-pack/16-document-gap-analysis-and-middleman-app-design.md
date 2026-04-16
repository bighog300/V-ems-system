# 16 - Document Gap Analysis and Middleman App Design Report

## Objective
Review the existing repository documentation and identify what is missing for successful delivery of the ambulance operations platform, with focused recommendations for:
- end-to-end architecture,
- API integration to Vtiger and OpenEMR,
- middleman app design for ambulance crew users, dispatch center operators, management users, and stores/logistics users.

## Documents reviewed
- `README.md`
- `docs/README.md`
- `docs/specs/openapi.yaml`
- `docs/specs/canonical-data-model.yaml`
- `docs/specs/event-contracts.yaml`
- `docs/specs/state-machines.yaml`
- `docs/build-pack/00-platform-build-pack.md`
- `docs/build-pack/03-role-permissions-matrix.md`
- `docs/build-pack/04-api-integration-spec.md`
- `docs/build-pack/05-screen-ux-spec.md`
- `docs/build-pack/15-repo-readiness-review-and-auto-build-recommendations.md`

---

## 1) Current strengths in documentation

### 1.1 Strong domain ownership boundaries
Current documents clearly split operational ownership to Vtiger and clinical ownership to OpenEMR, while placing orchestration responsibility in the custom platform.

### 1.2 Baseline contract assets exist
The repository includes machine-readable contracts (OpenAPI, canonical data model, state machines, event contracts, env config), which is a strong foundation for contract-first implementation.

### 1.3 Role and UX intent are defined at high level
Role matrix and screen list define who uses the system and what key screens are needed.

### 1.4 Workflow and status vocabulary is available
Incident, assignment, call, and vehicle lifecycle states are already represented and can anchor implementation logic.

---

## 2) Documentation gaps (missing or insufficiently detailed)

## 2.1 Architecture gaps

### A. Missing C4-level architecture artifacts
What exists:
- textual architecture overview only.

What is missing:
- **Context diagram** (external actors/systems: emergency line, hospital systems, mapping, SMS, auth provider).
- **Container diagram** for middleman platform components.
- **Component diagram** for orchestration service internals.
- **Deployment diagram** (environments, network zones, ingress, private integration workers).

Needed deliverables:
1. `docs/architecture/01-context-diagram.md`
2. `docs/architecture/02-container-diagram.md`
3. `docs/architecture/03-component-diagram.md`
4. `docs/architecture/04-deployment-topology.md`

### B. Missing non-functional architecture specification
What is missing:
- availability/SLA targets by workflow,
- latency budgets (dispatch-board freshness, assignment propagation, sync lag),
- RTO/RPO, backup and restore strategy,
- offline synchronization conflict policy for crew app,
- multi-tenant/site support model if multiple branches/regions are intended.

Needed deliverable:
- `docs/architecture/05-nfr-and-slo-spec.md`

### C. Missing cross-cutting security architecture
What is missing:
- SSO/IAM model (OIDC/SAML, token TTLs, refresh strategy),
- RBAC/ABAC enforcement points,
- audit log immutability design,
- PHI/PII encryption strategy (at rest/in transit/key rotation),
- break-glass access workflow for clinical data,
- API threat model and rate limiting policy.

Needed deliverables:
1. `docs/security/01-authn-authz-model.md`
2. `docs/security/02-data-protection-and-audit.md`
3. `docs/security/03-threat-model-and-api-controls.md`

---

## 2.2 Vtiger and OpenEMR API integration gaps

### A. Missing concrete adapter specifications
What exists:
- internal API endpoints and high-level flow.

What is missing:
- exact upstream API endpoint mapping per use case,
- protocol details (REST/SOAP/webhooks/batch),
- version pinning strategy,
- payload transformation rules and field-level mapping,
- identity reconciliation policy,
- retry and dead-letter handling per endpoint,
- upstream error-code normalization matrix.

Needed deliverables:
1. `docs/integrations/vtiger/01-api-capability-matrix.md`
2. `docs/integrations/openemr/01-api-capability-matrix.md`
3. `docs/integrations/02-field-mapping-catalog.md`
4. `docs/integrations/03-error-normalization-and-retry.md`

### B. Missing event choreography details between adapters
What is missing:
- canonical sequence diagrams for core flows,
- source-of-truth decision points for conflicting updates,
- deduplication and idempotency-key construction rules,
- temporal ordering constraints (e.g., encounter created before clinical payload writes).

Needed deliverables:
1. `docs/integrations/04-sequence-diagrams.md`
2. `docs/integrations/05-idempotency-and-dedup-rules.md`

### C. Missing contract governance and compatibility policy
What is missing:
- backward compatibility policy for public/internal APIs,
- enum/version deprecation policy,
- schema migration process for canonical data model,
- release note template for integration-impacting changes.

Needed deliverable:
- `docs/spec-governance/01-contract-compatibility-policy.md`

---

## 2.3 Middleman app design gaps by user group

## A. Ambulance users (field crew mobile/tablet)
Current:
- screen list and UX notes exist.

Missing:
- offline-first data model and local cache design,
- sync queue priorities (status updates vs full clinical draft),
- safe-edit model for multi-crew concurrent editing,
- device management (MDM, remote wipe, session timeout),
- geolocation cadence and battery tradeoff policy,
- usability profile for gloved operation/night mode.

Needed deliverables:
1. `docs/product/crew-app/01-user-journeys.md`
2. `docs/product/crew-app/02-offline-sync-design.md`
3. `docs/product/crew-app/03-device-and-security-controls.md`

## B. Dispatch centre operators
Current:
- dispatcher board concept exists.

Missing:
- dispatch triage algorithm/design notes,
- assignment recommendation inputs (distance, skill mix, stock readiness, maintenance state),
- conflict handling UX (double assignment, status mismatch, stale tracking),
- SLA breach alerting thresholds and escalation ladder,
- mass-casualty mode behaviour.

Needed deliverables:
1. `docs/product/dispatch/01-dispatch-workflow-and-rules.md`
2. `docs/product/dispatch/02-recommendation-engine-inputs.md`
3. `docs/product/dispatch/03-exception-and-escalation-playbook.md`

## C. Management users (operations + clinical governance)
Current:
- supervisor and reviewer roles are named.

Missing:
- KPI catalog definitions (exact formulas, source fields, refresh interval),
- governance dashboard data lineage,
- export policy and access boundaries,
- executive reporting cadence and ownership.

Needed deliverables:
1. `docs/product/management/01-kpi-catalog.md`
2. `docs/product/management/02-dashboard-data-lineage.md`
3. `docs/product/management/03-reporting-governance.md`

## D. Stores and logistics users (stock + replenishment)
Current:
- stock usage/replenishment concept exists.

Missing:
- warehouse-to-vehicle replenishment process map,
- batch/lot and expiry handling,
- controlled medication handling controls,
- stock count variance workflow,
- supplier integration model and purchase order touchpoints,
- stock forecasting and min/max strategy.

Needed deliverables:
1. `docs/product/logistics/01-stock-operating-model.md`
2. `docs/product/logistics/02-replenishment-and-expiry-controls.md`
3. `docs/product/logistics/03-supplier-and-procurement-integrations.md`

---

## 3) Recommended middleman app target architecture

## 3.1 Logical components
1. **API Gateway / BFF layer**
   - role-aware APIs for web/mobile clients,
   - request validation, authn/authz enforcement, correlation IDs.
2. **Operational Orchestrator**
   - incident and assignment workflow commands,
   - state transition guard enforcement.
3. **Clinical Bridge Service**
   - patient search/create and encounter lifecycle to OpenEMR,
   - clinical payload normalization.
4. **Vtiger Adapter Service**
   - operational write/read synchronization with retry and DLQ.
5. **Event Bus + Workflow Workers**
   - asynchronous processing and eventual consistency handling.
6. **Unified Timeline Aggregator**
   - read-model generation across operational + clinical events.
7. **Notification and Alerting Service**
   - SLA breach, sync failure, and escalation notifications.
8. **Reporting/Analytics Read Model**
   - management dashboards and logistics analytics.

## 3.2 Data stores
- **Transactional orchestration DB**: incidents, assignments, links, sync metadata.
- **Read-optimized projections**: dispatcher board, supervisor exceptions, logistics stock views.
- **Audit/event store**: immutable append-only audit and integration traces.
- **Offline sync store (device-side)**: encrypted local queue for crew app.

## 3.3 Cross-system consistency strategy
- Use `Incident ID` as global anchor.
- Persist external IDs in link tables (`openemr_patient_id`, `openemr_encounter_id`, vtiger entity IDs).
- Apply idempotency keys to all create/write operations.
- Enforce outbox/inbox pattern for adapter reliability.
- Drive human-visible exception queues from dead-letter events.

---

## 4) Needed API scope additions (internal API)

The existing OpenAPI is useful but incomplete for a production-grade middleman app. Add endpoints for:

### 4.1 Dispatch and operations control
- `GET /api/dispatch/board`
- `POST /api/incidents/{incidentId}/stand-down`
- `POST /api/incidents/{incidentId}/cancel`
- `POST /api/assignments/{assignmentId}/reassign`
- `POST /api/assignments/{assignmentId}/acknowledge`
- `POST /api/assignments/{assignmentId}/arrive-scene`

### 4.2 Crew sync/offline resilience
- `GET /api/mobile/sync/bootstrap`
- `POST /api/mobile/sync/events`
- `GET /api/mobile/sync/conflicts`
- `POST /api/mobile/sync/conflicts/{conflictId}/resolve`

### 4.3 Logistics and stock operations
- `GET /api/vehicles/{vehicleId}/stock`
- `POST /api/vehicles/{vehicleId}/replenishment-requests`
- `POST /api/replenishments/{requestId}/pick`
- `POST /api/replenishments/{requestId}/deliver`
- `POST /api/replenishments/{requestId}/verify`
- `POST /api/stock/counts`

### 4.4 Management and governance read models
- `GET /api/management/kpis`
- `GET /api/management/exceptions`
- `GET /api/audit/incidents/{incidentId}/timeline`
- `GET /api/audit/sync-failures`

---

## 5) Priority roadmap for documentation completion

## Phase 1 (must-have before implementation expansion)
1. C4 architecture set (context/container/component/deployment).
2. Vtiger and OpenEMR capability matrices + field mapping catalog.
3. Crew offline sync architecture and dispatch exception handling.
4. Security architecture (authn/authz/audit/data protection).

## Phase 2 (must-have before UAT)
1. KPI catalog and management dashboard lineage.
2. Logistics operating model, replenishment controls, expiry/lot workflow.
3. API compatibility and schema evolution policy.
4. SLO/NFR document with performance and reliability targets.

## Phase 3 (must-have before production)
1. Disaster recovery and business continuity runbooks.
2. Operational playbooks for integration outages.
3. Compliance evidence mapping (clinical/operational audit obligations).

---

## 6) Definition of documentation completeness for this app

Documentation is sufficiently complete when all are true:
1. Every major user group has explicit journey, error-path, and exception workflow docs.
2. Every integration flow has sequence diagrams and field mappings.
3. Every API write flow has idempotency + retry + failure visibility rules.
4. Security and audit controls are implementation-actionable.
5. Non-functional targets are measurable and tied to dashboards/alerts.
6. Release governance defines compatibility and change impact process.

---

## 7) Immediate next action checklist
- [ ] Create architecture folder and C4 diagram docs.
- [ ] Create integration folder with Vtiger/OpenEMR capability and field mapping docs.
- [ ] Add crew offline-sync and dispatch exception design docs.
- [ ] Add logistics stock operating and replenishment workflow docs.
- [ ] Add management KPI and dashboard lineage docs.
- [ ] Add security model and contract compatibility policy docs.
- [ ] Extend OpenAPI with dispatch/offline/logistics/management read endpoints.
