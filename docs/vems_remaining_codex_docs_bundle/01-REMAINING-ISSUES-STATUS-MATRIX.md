# Remaining Production Issues — Status Matrix

This bundle covers only issues that are **partially closed** or **not closed** from the prior production-readiness audit.

## Status legend
- **Partial**: meaningful progress exists, but the issue is not production-complete.
- **Open**: the issue remains unresolved in a production-suitable way.

## Remaining issues

| ID | Issue | Status | Why it remains open |
|---|---|---|---|
| 1 | Real authentication and identity | Partial | JWT auth exists, but current implementation is HS256-focused and does not yet provide full OIDC discovery, JWKS rotation, key rollover, issuer metadata management, or a production identity provider integration story. |
| 2 | Real OpenEMR and Vtiger integrations | Partial | HTTP transports are wired, but real vendor auth lifecycle, endpoint contract validation, pagination, idempotency, upstream error classification, and end-to-end validation against live systems are not yet proven. |
| 3 | Production-grade database runtime | Open | The orchestration DB layer still depends on an external `sqlite3` CLI binary, which is not a production-grade runtime design. |
| 4 | Docker/runtime boot validation | Partial | Entry points were added, but the full stack has not been proven via successful image build, `docker compose up`, health checks, init completion, and app reachability. |
| 5 | Secrets management | Partial | Placeholder secrets and env injection conventions exist, but there is no concrete secret manager integration or deployment-grade secret handling path yet. |
| 6 | Backup and restore aligned to deployed architecture | Partial | MySQL mode was added, but scheduled backups, restore drills, volume capture, and operational recovery validation are not yet complete. |
| 7 | Authorization model hardening | Partial | RBAC improved, but a fully centralized role-policy matrix and least-privilege review across all support/admin/operator paths is still needed. |
| 11 | Durable observability stack | Partial | Logging and correlation improved, but exported metrics, alerting, dashboards, aggregation targets, and production telemetry wiring are still incomplete. |
| 12 | Deployment-grade process supervision | Partial | Container entry points improved, but restart policies, graceful shutdown behavior, startup ordering guarantees, and deployment-time supervision strategy are not fully complete. |
| 15 | TLS / ingress definition and implementation | Partial | Model docs exist, but deployed ingress/TLS behavior is not implemented and validated in the runtime stack. |
| 16 | Governance / compliance operationalization | Partial | Operational docs exist, but access review, retention enforcement, audit review procedures, and incident response execution are not yet implemented as operating controls. |

## Goal of this bundle
Close all partial and open issues above with minimal, production-oriented changes, updated tests, and updated runtime documentation.
