# Dispatcher Information Architecture

## Top-level layout
Use a three-zone dispatcher layout on desktop:

### Zone A — Global control bar
Persistent across the top:
- environment / auth state
- current time and last refresh
- active incident count
- unassigned count
- overdue / escalated count
- board filters
- manual refresh / pause updates

### Zone B — Priority board
Main board area showing incidents grouped by operational urgency:
- Critical
- High priority
- Pending assignment
- In progress
- Blocked / escalation
- Closed / recently resolved (collapsed by default)

### Zone C — Context side panel
Right-side contextual panel that changes based on selected incident:
- incident details
- patient link / encounter summary
- available units
- assignment controls
- recent activity log
- escalation notes

## Dispatcher default sort
Within each group, sort by:
1. severity
2. SLA breach / overdue state
3. age since creation
4. assignment state
