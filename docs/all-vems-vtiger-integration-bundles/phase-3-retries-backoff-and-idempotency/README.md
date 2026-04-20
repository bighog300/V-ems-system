# Phase 3 — VEMS↔vtiger Retries, Backoff, and Idempotency

## Objective
Make vtiger-bound sync behavior resilient without creating duplicate CRM records or endless retries.

## Repo surfaces this phase targets
- `services/orchestration/src/sync-worker.mjs`
- `services/orchestration/src/sync-worker-service.mjs`
- `services/orchestration/src/repositories/sync-intent-repository.mjs`
- `services/orchestration/src/migrations/002_sync_backoff_replay.sql`
- orchestration tests for sync failure/retry behavior
- diagnostics payloads in `services/api-gateway/src/server.mjs`

## Current repo reality
The sync worker already has:
- `maxAttempts`
- `baseBackoffMs`
- `maxBackoffMs`
- dead-letter transition
- error classification capture

This phase hardens those semantics specifically for vtiger.
