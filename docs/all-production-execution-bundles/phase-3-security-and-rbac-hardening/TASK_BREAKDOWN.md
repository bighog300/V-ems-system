# Task Breakdown

## A. Route audit
Inspect:
- `services/api-gateway/src/server.mjs`
- `services/api-gateway/src/auth.mjs`
- `services/api-gateway/src/authorization-policy.mjs`
- related tests under `services/api-gateway/test`

### Required changes
1. Inventory every route and its required actor/role.
2. Ensure critical write routes are never implicitly open in production mode.
3. Keep `/health` and clearly intended support endpoints explicit in their behavior.
4. Make the `RBAC_ENFORCE` behavior safe by default for production-oriented environments.

## B. Dev-vs-production auth behavior
Current local development uses request headers:
- `x-user-role`
- `x-actor-id`

### Required changes
1. Preserve local workflow convenience for development and tests.
2. Prevent dev header-only behavior from becoming the production default.
3. Clearly separate:
   - development auth mode
   - production auth expectations
4. Document the expected production auth integration points, even if the repo still uses a simpler mechanism internally.

## C. Runtime hardening
Candidate areas:
- request size limits
- security headers
- CORS policy
- error message leakage
- support endpoint exposure
- audit-oriented logging for sensitive actions

### Required changes
1. Add secure defaults that do not break the current UI.
2. Ensure error payloads remain contract-compatible.
3. Ensure support metrics are not accidentally a public unauthenticated production endpoint unless explicitly intended.

## D. Dependency and image scanning
Add the lightest practical checks for this repo:
- npm audit or equivalent CI-friendly package scanning
- container/image scanning if the repo’s Docker path is actively used in CI or release

Keep this pragmatic. Do not add a giant security platform.
