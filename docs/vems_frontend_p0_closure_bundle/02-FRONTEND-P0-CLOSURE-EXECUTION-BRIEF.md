# Frontend P0 Closure Execution Brief

## Scope
This bundle is intentionally narrow. Only fix the two remaining frontend P0 issues:

### Issue A — strict auth enforcement
Primary target:
- `apps/web-control/src/http.mjs`

Likely related:
- `apps/web-control/src/session.mjs`
- `apps/web-control/src/runtime.mjs`
- `apps/web-control/src/api-error.mjs`
- tests under `apps/web-control/test/`

### Issue B — final XSS hardening
Primary target:
- `apps/web-control/src/crew.mjs`

Review also:
- `apps/web-control/src/main.mjs`
- any renderer that still emits dynamic template strings into `innerHTML`

## Required outcomes

### A. Auth
- Legacy impersonation headers are allowed **only** in explicit dev mode.
- In production mode, no token means request failure.
- Production-mode behavior must be driven by an explicit configuration flag, not only hostname heuristics.

### B. XSS
- All dynamic values rendered by `crew.mjs` must be escaped before interpolation, or moved to DOM node creation with `textContent`.
- Do not leave partially escaped mixed render paths.

## Constraints
- Make the smallest high-confidence changes.
- Do not redesign the frontend architecture beyond what is needed for these two closures.
- Preserve backend API contracts except for disallowing legacy auth fallback in production mode.
- Update tests.
- End only when the frontend test suite passes.
