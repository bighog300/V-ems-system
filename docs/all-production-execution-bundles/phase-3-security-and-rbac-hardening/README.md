# Phase 3 — Security and RBAC Hardening

## Objective
Move the repo from development-friendly header-context behavior to a production-safe security posture while preserving the current API shape where practical.

## Repo reality this bundle is based on
The repo already contains:
- auth handling in `services/api-gateway/src/auth.mjs`
- authorization logic in `services/api-gateway/src/authorization-policy.mjs`
- RBAC flagging in `services/api-gateway/src/server.mjs`
- tests in `services/api-gateway/test/production-readiness-foundations.test.mjs`
- UI/session helpers in `apps/web-control/src/session.mjs` and `src/security.mjs`

Current docs still position RBAC/security as later-phase work. This bundle closes that gap.

## Exact scope
1. Audit route protection in the API gateway.
2. Ensure role-based authorization is explicit for critical routes.
3. Remove or isolate dev-only bypass behavior from production paths.
4. Harden runtime defaults and request handling.
5. Add CI-visible security checks that fit this repo.
