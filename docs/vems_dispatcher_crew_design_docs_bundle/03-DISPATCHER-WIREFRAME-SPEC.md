# Dispatcher Wireframe Specification

## Desktop wireframe

```text
+--------------------------------------------------------------------------------------------------+
| VEMS Dispatcher Board | Last refresh 14:03:08 | Active 18 | Unassigned 4 | Overdue 2 | Filters |
+--------------------------------------------------------------------------------------------------+
| Critical (2)                           | Incident Details / Actions                             |
| ------------------------------------- | ------------------------------------------------------ |
| [INC-1042] Cardiac arrest             | Incident ID                                            |
| 14m old | Unassigned | Zone North     | Priority / age / zone                                  |
| [Assign Unit] [Escalate]              | Address / patient / notes                              |
|                                       | Available units list                                   |
| [INC-1048] RTC with entrapment        | [Assign selected unit] [Mark acknowledged]             |
| 11m old | Blocked | Needs supervisor  | Activity timeline                                      |
| [Open] [Escalate]                     |                                                       |
+--------------------------------------------------------------------------------------------------+
```

## Card design
Each incident card should show:
- incident ID
- title / type
- age
- assignment state
- zone
- primary warning flags
- one primary action
- one secondary action
