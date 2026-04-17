# Phase C5 — Expanded Metrics and Alerting Hooks

## Goal
Build on the existing metrics foundation to improve operational visibility and future alerting readiness.

## Existing foundation
- API request metrics
- API failure counts
- latency summary
- sync worker counters
- internal metrics endpoint

## Scope for this workstream
- add useful operational counters
- add threshold/alert-hook-ready structures
- surface the most useful counters in diagnostics/support UI where appropriate

## Candidate counters
- failed syncs by target system
- stock sync outcome counts
- RBAC deny counts
- readiness/connectivity validation success/failure counts

## Testing
- metrics increment behavior tests
- payload tests if exposed
- threshold hook tests where practical

## Definition of done
- more useful counters exist
- alert-ready structures exist
- tests pass
