
# Vtiger Customization Specification

## Scope
Defines all Vtiger customizations required for the ambulance system.

## Custom Elements
- Modules: incidents, assignments, vehicle_stock
- Fields: priority, hazard_flags, response_time
- Workflows: incident lifecycle, assignment updates

## Deployment
- Use API where possible
- Use module packages
- Avoid direct DB edits

## Scripts
- create-modules.sh
- apply-fields.sh
- setup-workflows.sh
