# Autonomous GPT Execution Upgrade Pack (Docs 14–17)

This pack upgrades the repository to be **AI-executable with minimal drift**. It introduces hard constraints, a golden path, contract priority, and acceptance tests.

---

# 14 - System Objective (Hard Constraint)

## Non-Negotiable Objective
The system MUST enable a complete, uninterrupted emergency response workflow:

**call intake → incident creation → dispatch → crew response → patient identification → clinical encounter → treatment → handover → incident closure**

With the following guarantees:
- No duplicated data entry across systems
- Strict separation of operational vs clinical data
- Full audit traceability for all actions
- Event-driven synchronization across systems

## Ownership Rules (Absolute)
- Vtiger = operational source of truth
- OpenEMR = clinical source of truth
- Incident ID = cross-system anchor

Any implementation violating these rules is invalid.

---

# 15 - Golden Path Scenario

## Canonical End-to-End Flow

1. Call received (Vtiger)
   - Input: caller details, location, description
   - Output: Call record (CALL-XXXXXX)

2. Incident created (Vtiger)
   - Output: Incident ID (INC-XXXXXX)

3. Dispatcher assigns ambulance
   - Output: Assignment (ASN-XXXXXX)

4. Crew accepts and mobilises
   - Status: Assigned → Accepted → Mobilised

5. Crew arrives on scene
   - Status: En Route → On Scene

6. Patient identified
   - Search OpenEMR
   - If no match → create patient

7. Encounter created (OpenEMR)
   - Linked via Incident ID

8. Clinical care recorded
   - Observations
   - Interventions

9. Transport or non-transport decision

10. Handover completed
   - Output: disposition, destination

11. Incident closed (Vtiger)
   - Requires:
     - no active assignments
     - handover or non-transport reason

## Expected Events
- IncidentCreated
- AssignmentCreated
- PatientMatched/Created
- EncounterCreated
- HandoverCompleted
- StockUsageRecorded

---

# 16 - Non-Negotiable Rules

## Absolute Prohibitions
- DO NOT write directly to Vtiger or OpenEMR from UI
- DO NOT bypass orchestration layer
- DO NOT invent new status values
- DO NOT duplicate clinical data into Vtiger
- DO NOT skip event emission
- DO NOT skip audit logging

## Mandatory Requirements
- All APIs must match OpenAPI spec
- All state changes must pass state machine validation
- All operations must include correlation_id
- All create operations must support idempotency
- All failures must produce retryable or non-retryable classification

---

# 17 - Acceptance Test Scenarios (Spec Level)

## Scenario 1: Standard Emergency Transport
- Create incident
- Assign crew
- Crew accepts
- Patient created
- Encounter created
- Treatment recorded
- Transport completed
- Handover completed
- Incident closed

Expected:
- All state transitions valid
- Events emitted
- Audit logs present

## Scenario 2: No Transport
- Same as above until treatment
- Handover marked as non-transport
- Incident closed

Expected:
- No destination required
- Closure allowed with reason

## Scenario 3: Assignment Cancelled Mid-Response
- Assignment created
- Crew en route
- Dispatcher cancels

Expected:
- Status → Stood Down
- Incident returns to Awaiting Dispatch

## Scenario 4: Patient Match Ambiguous
- Multiple candidates returned
- User must select or create

Expected:
- No automatic linking
- Verification required

## Scenario 5: Stock Usage Trigger
- Intervention recorded
- Linked stock item exists

Expected:
- StockUsageRecorded event emitted
- Vehicle stock reduced

## Scenario 6: Sync Failure
- OpenEMR unavailable

Expected:
- Retry triggered
- Event sent to DLQ after max retries
- Incident remains operational

---

# Contract Priority Order (Critical)

1. OpenAPI → API truth
2. State machines → workflow truth
3. Data model → structure truth
4. Event contracts → integration truth
5. Build-pack docs → explanatory only

If conflicts occur, follow this order strictly.

---

# Completion Criteria

System is complete when:
- Golden path executes end-to-end without manual intervention
- All acceptance scenarios pass
- No rule violations detected
- All events and logs present

---

# Final Instruction to AI Agents

Do not reinterpret the system.

Implement exactly what is defined.

If unsure, prefer:
- strict validation
- explicit errors
- adherence to contracts

Never guess missing behavior—fail safely instead.

