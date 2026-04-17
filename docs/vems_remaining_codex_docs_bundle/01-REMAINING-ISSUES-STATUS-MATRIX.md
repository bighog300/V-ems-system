# Remaining Production Issues — Status Matrix

This bundle covers only issues that are **partially closed** or **not closed** from the prior production-readiness audit.

## Status legend
- **Partial**: meaningful progress exists, but the issue is not production-complete.
- **Open**: the issue remains unresolved in a production-suitable way.

## Remaining issues

| ID | Issue | Status | Why it remains open |
|---|---|---|---|
| 1 | Real authentication and identity | Closed | Gateway supports verified HS256 and RS256 tokens, issuer/audience checks, JWKS-based public key validation, and explicit header-trust dev mode controls. |
| 2 | Real OpenEMR and Vtiger integrations | Closed | Adapters now enforce auth config, deterministic timeouts, configurable routes, and upstream error classification with dedicated transport tests. |
| 3 | Production-grade database runtime | Partial | Orchestration DB prefers embedded `node:sqlite` runtime when available, but still falls back to `sqlite3` CLI in Node environments without the built-in module. |
| 4 | Docker/runtime boot validation | Closed | Compose/services enforce dependency health checks and fail-fast runtime variable validation for deterministic boot behavior. |
| 5 | Secrets management | Closed | Runtime secret placeholders are enforced, startup validates required secret injection, and compose fails fast on missing credentials. |
| 6 | Backup and restore aligned to deployed architecture | Closed | Backup/restore scripts validate post-restore health for SQLite/MySQL modes and runbook documents cadence plus drill requirements. |
| 7 | Authorization model hardening | Closed | Role policy mapping is centralized and governed with explicit least-privilege review procedures. |
| 11 | Durable observability stack | Closed | Structured logs, correlation IDs, internal metrics, and alert-state diagnostics are documented as minimum production observability controls. |
| 12 | Deployment-grade process supervision | Closed | Compose restart policies, health-gated startup ordering, and startup fail-fast checks define deployment supervision behavior. |
| 15 | TLS / ingress definition and implementation | Closed | Concrete NGINX ingress and staging compose TLS wiring were added with HTTPS redirect and hardened header policies. |
| 16 | Governance / compliance operationalization | Closed | Governance docs now include concrete access review, audit log review, incident response, ownership, and cadence controls. |

## Goal of this bundle
Close all partial and open issues above with minimal, production-oriented changes, updated tests, and updated runtime documentation.
