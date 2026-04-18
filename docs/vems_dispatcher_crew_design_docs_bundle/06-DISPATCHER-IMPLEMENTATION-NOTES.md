# Dispatcher Implementation Notes

## Implementation strategy
Keep changes incremental.

### Phase A
- Add board header with KPIs and refresh state
- Add grouped board rendering
- Add selected-incident side panel

### Phase B
- Introduce card status design system
- Add changed-card highlighting on poll refresh
- Improve keyboard and accessibility behavior

### Phase C
- Reduce dense multi-purpose content on main page
- Split secondary information from primary dispatch board

## Acceptance criteria
- Dispatcher can identify highest-priority items in under 3 seconds
- Unassigned and blocked incidents are visually obvious
- Common actions require fewer clicks than current UI
- Board stays usable during continuous refresh
