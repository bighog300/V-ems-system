# Phase C1 — Support/Admin Diagnostics UI

## Goal
Turn the existing diagnostics endpoint into a usable support/admin-facing UI surface.

## Existing backend
- `GET /api/support/diagnostics`

## Required UI sections
- readiness summary
- metrics summary
- sync and failure summary
- upstream validation summary

## UX requirements
- read-only
- support-oriented
- clear empty/error states
- no secrets or unsafe config exposure

## RBAC requirements
- support/admin-capable roles only when RBAC is enabled

## Testing
- rendering tests
- empty/error-state tests
- role-aware access behavior where practical

## Definition of done
- diagnostics UI exists
- renders real backend data
- remains read-only and safe
- tests pass
