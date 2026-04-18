# Dispatcher Component Specification

## Components to add or refactor

### BoardHeader
Displays:
- title
- refresh state
- KPI chips
- filters
- update pause/manual refresh controls

### IncidentCard
Must support:
- status badges
- age pill
- escalation badge
- primary CTA
- secondary CTA
- changed-state highlight

### IncidentDetailPanel
Contextual side panel with:
- summary section
- operational details
- assignment controls
- timeline/activity
- escalation area

## Existing file mapping
Likely files to evolve:
- `apps/web-control/src/index.html`
- `apps/web-control/src/main.mjs`
- `apps/web-control/src/board.mjs`
- `apps/web-control/src/summary.mjs`
- `apps/web-control/src/styles.css`
