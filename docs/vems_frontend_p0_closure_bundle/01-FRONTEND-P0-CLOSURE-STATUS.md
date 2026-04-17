# Frontend P0 Closure Bundle

## Remaining P0 items
Only two frontend P0 items remain partially open:

1. **Strict auth enforcement**
   - Current frontend HTTP layer prefers `Authorization: Bearer ...` but still falls back to legacy `x-actor-id` / `x-user-role` headers when no token is present.
   - This must not happen in production mode.

2. **Complete XSS hardening**
   - High-risk views `board.mjs` and `summary.mjs` were hardened, but `crew.mjs` still contains template-string-heavy rendering paths and remains part of the XSS surface.

## Goal
Close both remaining frontend P0 items completely.

## Definition of done
- No production request path falls back to legacy impersonation headers.
- Missing token in production mode causes a hard auth failure, not silent downgrade.
- `crew.mjs` and any remaining frontend renderers no longer inject unescaped dynamic values into `innerHTML`.
- Tests fail if auth fallback reappears in production mode.
- Tests fail if unsafe HTML is rendered unescaped in the remaining views.
