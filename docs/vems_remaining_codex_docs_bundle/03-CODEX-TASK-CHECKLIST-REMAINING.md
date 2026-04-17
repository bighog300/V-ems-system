# Codex Task Checklist — Remaining Production Work

Use this as an execution checklist. Check items off in your final summary.

## Issue 1 — Authentication and identity
- [ ] Review current JWT implementation in `services/api-gateway/src/auth.mjs`
- [ ] Add production-suitable verification path (prefer JWKS / asymmetric validation)
- [ ] Keep explicit dev-mode path documented and isolated
- [ ] Ensure roles and actor identity derive only from verified claims
- [ ] Add tests for valid token, invalid signature, expired token, bad issuer, bad audience

## Issue 2 — OpenEMR / Vtiger integrations
- [ ] Review current adapter transport layer
- [ ] Add clear auth config handling
- [ ] Add request timeout behavior
- [ ] Add upstream error classification
- [ ] Add configurable endpoint path handling
- [ ] Add tests for auth failure, timeout, 4xx, 5xx, retry-safe cases

## Issue 3 — Database runtime
- [ ] Remove any `sqlite3` CLI shell dependency from orchestration DB access
- [ ] Implement a runtime DB approach that does not shell out
- [ ] Preserve migration support
- [ ] Update repository access if needed
- [ ] Add tests proving DB access works in repo test environment

## Issue 4 — Docker/runtime boot validation
- [ ] Ensure OpenEMR and Vtiger entry points actually run init logic
- [ ] Ensure compose waits for dependencies correctly
- [ ] Ensure health checks reflect actual readiness
- [ ] Update startup and health scripts for real validation
- [ ] Document smoke-test commands and expected healthy states

## Issue 5 — Secrets management
- [ ] Remove insecure defaults from committed runtime files
- [ ] Add example/template files only
- [ ] Document required secret variables and source
- [ ] Ensure compose/runtime fails fast when required secrets are missing

## Issue 6 — Backup / restore
- [ ] Align backup script with actual supported DB engine
- [ ] Align restore script with actual supported DB engine
- [ ] Add verification / post-restore validation steps
- [ ] Document volume backup expectations if needed

## Issue 7 — Authorization hardening
- [ ] Create centralized policy mapping
- [ ] Review all support/admin/operator endpoints
- [ ] Close policy gaps and least-privilege issues
- [ ] Add/expand tests for denied vs allowed role paths

## Issue 11 — Observability
- [ ] Add/export metrics endpoint or metrics format
- [ ] Ensure correlation/request IDs flow through logs
- [ ] Document alert-worthy signals
- [ ] Add tests for metrics/readiness endpoints where appropriate

## Issue 12 — Process supervision
- [ ] Define startup ordering
- [ ] Add graceful shutdown handling
- [ ] Add restart policies or supervision config
- [ ] Update runtime docs

## Issue 15 — TLS / ingress
- [ ] Add concrete ingress/reverse-proxy config or manifests
- [ ] Define HTTPS redirect / secure headers handling
- [ ] Wire docs to actual repo artifacts

## Issue 16 — Governance / compliance
- [ ] Add incident response runbook
- [ ] Add access review checklist
- [ ] Add retention/review checklist
- [ ] Add audit log review procedure
- [ ] Make ownership/cadence explicit in docs
