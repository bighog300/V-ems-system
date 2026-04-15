# Ambulance Platform Build Pack

## Purpose
This pack defines the core system design for an emergency ambulance service platform built with:
- **Vtiger** as the operational platform for call intake, incident management, dispatch workflow, vehicle management, stock, personnel, and operational reporting
- **OpenEMR** as the clinical platform for patient records, encounters, observations, treatment, and medical documentation
- **Custom web/mobile applications** as the user-facing interface for call handlers, dispatchers, ambulance crews, supervisors, and logistics staff

## Platform vision
The platform should support the full lifecycle of an ambulance service response:
1. Receive and log incoming emergency calls
2. Create and manage incidents
3. Prioritise and dispatch ambulances and crews
4. Support field teams with job details and status updates
5. Record patient care in a proper clinical record system
6. Track ambulance stock and equipment usage
7. Manage personnel readiness, shifts, and compliance
8. Produce complete operational and clinical audit trails

## System architecture overview
### Vtiger responsibilities
- calls
- incidents
- dispatch assignments
- ambulance resource records
- crew/personnel operational records
- vehicle readiness
- stock and replenishment
- maintenance and faults
- operational audit and non-clinical reporting

### OpenEMR responsibilities
- patient identity record
- clinical encounter record
- assessments and observations
- medications and interventions
- clinical notes
- handover and disposition
- historical patient care records

### Custom platform responsibilities
- call handler console
- dispatcher board
- crew tablet/mobile interface
- supervisor dashboard
- logistics and stock screens
- integration layer between Vtiger and OpenEMR
- unified incident timeline

## User roles
- Call Handler
- Dispatcher
- Ambulance Crew
- Supervisor
- Logistics / Fleet Staff
- Clinical Reviewer / Governance User

## Core modules
- Call Intake (Vtiger)
- Incident Management (Vtiger)
- Dispatch Queue (Vtiger data + custom UI)
- Ambulance Resource Module (Vtiger)
- Crew / Personnel Module (Vtiger)
- Shift and Availability (Vtiger)
- Ambulance Assignment (Vtiger)
- Patient Matching (shared, master in OpenEMR)
- Clinical Encounter (OpenEMR)
- Assessment and Observations (OpenEMR)
- Treatment and Intervention (OpenEMR)
- Clinical Handover / Disposition (OpenEMR with summary to Vtiger)
- Vehicle Stock (Vtiger)
- Stock Usage and Replenishment (Vtiger)
- Vehicle Readiness (Vtiger)
- Maintenance and Fault (Vtiger)
- Personnel Compliance (Vtiger)
- Audit and Timeline (split)
- Reporting and Analytics (reporting layer)

## Data ownership
| Data Area | Primary System | Notes |
|---|---|---|
| Calls | Vtiger | Master operational record |
| Incidents | Vtiger | Cross-system anchor record |
| Dispatch assignments | Vtiger | Operational source of truth |
| Vehicle/crew status | Vtiger | Updated by dispatch and crew app |
| Patient identity | OpenEMR | Vtiger may hold temporary placeholders |
| Clinical encounter | OpenEMR | Linked to incident ID |
| Observations | OpenEMR | Clinical record only |
| Medications/interventions | OpenEMR | May trigger stock adjustments |
| Vehicle stock | Vtiger | Vehicle acts as stock location |
| Personnel compliance | Vtiger | Operational assignment control |
| Unified timeline | Custom layer | Aggregated from both systems |

## Master identifiers
- **Call ID** – generated in Vtiger
- **Incident ID** – generated in Vtiger and used as the main cross-system reference
- **Assignment ID** – generated in Vtiger
- **Vehicle ID** – generated in Vtiger
- **Staff ID** – generated in Vtiger
- **OpenEMR Patient ID** – generated in OpenEMR
- **OpenEMR Encounter ID** – generated in OpenEMR

## MVP scope
### Vtiger MVP
- Call Intake
- Incident Management
- Dispatch Queue
- Ambulance Registry
- Crew Registry
- Shift and Availability
- Ambulance Assignment
- Vehicle Stock
- Vehicle Readiness

### OpenEMR MVP
- Patient Matching
- Clinical Encounter
- Assessment and Observations
- Treatment and Intervention
- Handover / Disposition

### Custom app MVP
- call handler screen
- dispatcher board
- crew assignment/status screen
- patient search/create bridge
- unified incident timeline
