# Issue 3 — Final Closure Bundle

## Issue
Complete orchestration DB runtime migration by removing the remaining `sqlite3` CLI fallback.

## Current status
Issue 3 is still **Partial** because `services/orchestration/src/db.mjs` prefers an embedded runtime when available, but still falls back to the external `sqlite3` CLI in the current Node 20 environment.

## Why this is still open
The production-readiness requirement was to remove shell-out database execution and eliminate dependence on an external database executable at runtime.

A fallback to `sqlite3` CLI means:
- runtime still depends on a host/container binary being present
- portability remains incomplete
- failure modes remain tied to external process execution
- the DB layer is not yet fully production-complete

## Goal
Close Issue 3 completely by ensuring the orchestration DB runtime no longer shells out to `sqlite3` under any supported runtime.

## Definition of done
- `services/orchestration/src/db.mjs` has **no** `sqlite3` CLI shell-out path
- orchestration persistence works in the repo test environment without requiring `sqlite3` CLI
- tests pass without `sqlite3` installed
- docs and scripts match the final DB runtime choice
