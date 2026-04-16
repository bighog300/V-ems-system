# Autonomous GPT Execution Upgrade Pack (Docs 14–17)

This pack upgrades the repository to be AI-executable with minimal drift.

## 14 - System Objective (Hard Constraint)
The system MUST enable this workflow:
call intake → incident creation → dispatch → crew response → patient identification → clinical encounter → treatment → handover → incident closure.

Guarantees:
- no duplicated data entry across systems
- strict operational vs clinical separation
- full audit traceability
- event-driven synchronization

## 15 - Golden Path Scenario
1. Call received (Vtiger)
2. Incident created (Vtiger)
3. Dispatcher assigns ambulance
4. Crew accepts and mobilises
5. Crew arrives on scene
6. Patient identified in OpenEMR
7. Encounter created
8. Clinical care recorded
9. Transport or non-transport decision
10. Handover completed
11. Incident closed

Expected events:
- IncidentCreated
- AssignmentCreated
- PatientMatched/Created
- EncounterCreated
- HandoverCompleted
- StockUsageRecorded

## 16 - Non-Negotiable Rules
Absolute prohibitions:
- no direct UI writes to Vtiger/OpenEMR
- no orchestration bypass
- no new status values
- no clinical duplication into Vtiger
- no skipped event emission
- no skipped audit logging

Mandatory requirements:
- OpenAPI alignment
- state machine validation for status changes
- correlation_id on all operations
- idempotency for creates
- retryable/non-retryable failures classified

## 17 - Acceptance Test Scenarios
1. Standard emergency transport
2. No transport
3. Assignment cancelled mid-response
4. Ambiguous patient match
5. Stock usage trigger
6. Sync failure with retries/DLQ

## Contract Priority Order
1. OpenAPI
2. State machines
3. Canonical data model
4. Event contracts
5. Build-pack docs
