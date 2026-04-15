# 04 - API Integration Specification

## Integration architecture
- **Vtiger** for operational records and workflow
- **OpenEMR** for patient and clinical records
- **Custom platform / integration service** as UI backend, API gateway, event processor, and orchestrator

## Integration principles
1. The custom platform should be the main integration orchestrator.
2. Vtiger and OpenEMR should not depend on direct tight coupling where avoidable.
3. All cross-system writes should use correlation IDs.
4. All create/update operations should be idempotent where possible.
5. Every integration failure must produce a visible technical log and retriable event where safe.
6. The Incident ID must be carried through all related payloads.

## Core flows
- Create Incident
- Assign Ambulance and Crew
- Search or Create Patient in OpenEMR
- Create Clinical Encounter
- Save Clinical Updates
- Complete Handover and Return Operational Summary
- Record Stock Usage

## Internal API surface
- `POST /api/incidents`
- `GET /api/incidents/{incidentId}`
- `PATCH /api/incidents/{incidentId}`
- `POST /api/incidents/{incidentId}/assignments`
- `PATCH /api/assignments/{assignmentId}`
- `POST /api/patients/search`
- `POST /api/patients`
- `POST /api/incidents/{incidentId}/patient-link`
- `POST /api/incidents/{incidentId}/encounters`
- `POST /api/encounters/{encounterId}/observations`
- `POST /api/encounters/{encounterId}/interventions`
- `POST /api/encounters/{encounterId}/handover`
- `POST /api/stock/usage`

## Error model
Standard error envelope:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "retryable": true,
    "correlation_id": "uuid",
    "details": {}
  }
}
```

## Idempotency
The following operations should support idempotency keys:
- create incident
- create assignment
- create patient
- create encounter
- record stock usage
