You are working inside the VEMS monorepo.

Read these docs first:
- docs/01-FRONTEND-P0-CLOSURE-STATUS.md
- docs/02-FRONTEND-P0-CLOSURE-EXECUTION-BRIEF.md
- docs/03-FRONTEND-P0-CLOSURE-CHECKLIST.md
- docs/04-FRONTEND-P0-CLOSURE-VALIDATION.md

## Goal
Close the final remaining frontend P0 items:
1. strict auth enforcement in production mode
2. complete XSS hardening for the remaining heavy renderer paths, especially `crew.mjs`

## Primary files
- `apps/web-control/src/http.mjs`
- `apps/web-control/src/runtime.mjs`
- `apps/web-control/src/session.mjs`
- `apps/web-control/src/api-error.mjs`
- `apps/web-control/src/crew.mjs`
- related frontend tests

## Required outcomes
- In production mode, no request silently falls back to `x-actor-id` / `x-user-role`
- Legacy impersonation headers are allowed only in explicit dev mode
- Missing token in production mode causes a clear auth failure
- `crew.mjs` no longer renders unescaped dynamic content into HTML
- Tests cover both closures
- Frontend tests pass

## Constraints
- Make the smallest high-confidence changes
- Do not redesign the app
- Preserve existing backend contracts except disallowing production auth fallback
- End only when the frontend test suite passes

## Output required
1. P0 closure status: Closed or Partial, with exact reason
2. Files changed
3. Commands run
4. Test results
5. Remaining frontend risks, if any
