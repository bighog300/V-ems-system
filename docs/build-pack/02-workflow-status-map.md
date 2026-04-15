# 02 - Workflow and Status Transition Map

## Workflow design principles
1. Every major entity must have a controlled status model.
2. Every status change must have an actor, timestamp, and audit trail.
3. Invalid transitions must be blocked by the application layer.
4. Operational workflow must continue even if patient identity is unknown.
5. Clinical workflow must not overwrite operational truth and vice versa.
6. Exceptions must be explicit states, not hidden edge cases.

## Core lifecycles
### Call
New -> In Progress -> Information Complete -> Converted to Incident -> Closed
or
In Progress -> Cancelled -> Closed

### Incident
New -> Awaiting Dispatch -> Assigned -> Crew Acknowledged -> En Route -> On Scene
then either:
- On Scene -> Treating On Scene -> Transporting -> At Destination -> Handover Complete -> Closed
or
- On Scene -> Treating On Scene -> Handover Complete -> Closed

Exception paths:
- Awaiting Dispatch -> Cancelled
- Assigned/Crew Acknowledged/En Route/On Scene -> Stood Down

### Assignment
Proposed -> Assigned -> Accepted -> Mobilised -> Active -> Completed
with alternate states:
- Reassigned
- Cancelled
- Stood Down

### Vehicle
Available -> Reserved -> Assigned -> En Route -> On Scene -> Transporting -> At Destination -> Returning to Base -> Restocking -> Available
Special states:
- Out of Service
- Maintenance
- Offline/Unknown

### Crew
Off Duty -> On Duty Available -> On Duty Assigned -> En Route -> On Scene -> Treating -> Transporting -> Handover -> Restocking -> On Duty Available

### Patient Identity
Unknown -> Provisional -> Match Pending -> Matched Existing / Created New -> Verified
or
Any state -> Duplicate Suspected

### Encounter
Not Started -> Open -> Assessment In Progress -> Treatment In Progress -> Ready for Handover -> Handover Completed -> Closed

## Escalation rules
- Awaiting Dispatch exceeds threshold -> flag supervisor
- Crew Acknowledged not received within threshold -> alert dispatcher
- En Route exceeds expected travel time -> flag exception
- Handover delay exceeds threshold -> notify supervisor
- Critical stock unavailable -> vehicle cannot be set Ready
