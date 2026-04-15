# 01 - Data Handoff Matrix

## Purpose
This document defines the field-level handoff between Vtiger, OpenEMR, and the custom application layer.

## Synchronisation principles
1. **Incident ID is the main cross-system anchor**.
2. **OpenEMR owns patient and clinical truth**.
3. **Vtiger owns dispatch and operational truth**.
4. **No field should have two independent masters**.
5. **Clinical detail should not be duplicated into Vtiger unless operationally required**.
6. **Failed sync events must be retried and logged**.

## Representative field matrix
| Domain | Field Name | Created In | Source of Truth | Synced To | Sync Trigger | Update Direction | Validation / Notes |
|---|---|---|---|---|---|---|---|
| Call | Call ID | Vtiger | Vtiger | Custom App | On create | One-way | Immutable unique identifier |
| Incident | Incident ID | Vtiger | Vtiger | OpenEMR, Custom App | On create | One-way | Primary cross-system identifier |
| Incident | Incident priority | Vtiger | Vtiger | Custom App | On create/update | One-way | Controlled list with escalation rules |
| Incident | Incident status | Vtiger | Vtiger | Custom App | On update | One-way | Must follow status map |
| Dispatch | Assignment ID | Vtiger | Vtiger | Custom App | On create | One-way | Immutable unique identifier |
| Dispatch | Assigned vehicle ID | Vtiger | Vtiger | Custom App | On assignment/update | One-way | Must reference active vehicle |
| Patient | OpenEMR Patient ID | OpenEMR | OpenEMR | Vtiger, Custom App | On successful match/create | One-way | Required before definitive link |
| Encounter | Encounter ID | OpenEMR | OpenEMR | Vtiger, Custom App | On encounter create | One-way | Immutable unique identifier |
| Clinical | Medication administered | OpenEMR | OpenEMR | Custom App, Vtiger (stock cue only) | On save | One-way to Vtiger summary | Map to stock if configured |
| Handover | Destination facility | OpenEMR / Custom App | OpenEMR for clinical, Vtiger for ops summary | Vtiger, Custom App | On handover | OpenEMR to Vtiger summary | Use facility master if possible |
| Stock | Quantity used | Custom App / Vtiger | Vtiger | Custom App | On usage submit | One-way | Requires vehicle + item + incident |

## Sync events
- Incident Created
- Patient Match Requested
- Patient Matched or Created
- Encounter Created
- Handover Completed
- Stock Usage Recorded

## Validation rules
- All timestamps must use ISO-8601 with timezone handling.
- All IDs must be immutable after creation.
- Controlled lists must be versioned and centrally managed.
- Low-confidence patient matches require user confirmation.
- Incident cannot be closed without final operational status.
- Vehicle cannot be assigned when marked out of service.
