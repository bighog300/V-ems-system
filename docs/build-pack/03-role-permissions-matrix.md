# 03 - Role and Permissions Matrix

## Access control principles
1. Access must be role-based and auditable.
2. Clinical data access must be more restricted than operational data access.
3. Supervisors may override operational states but those overrides must be logged.
4. Sensitive personnel records must be restricted to management roles.
5. Users must not be able to edit historical audit trails.

## Role catalogue
Operational:
- Call Handler
- Dispatcher
- Field Crew Member
- Field Crew Lead
- Supervisor
- Logistics Officer
- Fleet Manager
- Operations Manager

Clinical / Governance:
- Clinical Reviewer
- Medical Director / Clinical Lead

Administrative:
- System Administrator
- Integration Service Account
- Reporting Analyst

## Module access summary
| Module | Call Handler | Dispatcher | Field Crew | Supervisor | Logistics | Clinical Reviewer | Sys Admin |
|---|---|---|---|---|---|---|---|
| Call Intake | Create/Edit Own | View | View Assigned Summary | View/Edit All | No | No | Admin |
| Incident Management | Create/Edit Early | View/Edit All | View Assigned | View/Edit All/Override | View | View Limited | Admin |
| Dispatch Queue | View Limited | View/Edit All | View Assigned Only | View/Edit All/Override | No | No | Admin |
| Clinical Encounter | No | No | View Assigned/Create/Edit Assigned | View Limited Summary | No | View/Edit All | Admin |
| Vehicle Stock | No | View Summary | View Assigned/Edit Usage | View | View/Edit All | No | Admin |
| Audit Timeline | View Limited | View Limited | View Assigned | View All | View Relevant | View Clinical Relevant | Admin |

## Sensitive data rules
Sensitive categories:
- full clinical notes
- medication/intervention details
- disciplinary notes
- certification restrictions
- audit security logs

Controls:
- extra role checks
- explicit audit logging
- masked views in reports where needed
- no export without elevated permission
