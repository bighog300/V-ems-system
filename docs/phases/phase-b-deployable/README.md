# Phase B — Deployable Platform

## Goal

Turn the working application core into a reliably deployable platform that can be stood up consistently across development, staging, and production-like environments.

## Phase intent

Phase B is about reproducibility and operational confidence:
- no hand-configured environments
- repeatable environment bootstrap
- real upstream connectivity
- configurable deployment behavior

## Scope

### Required capabilities
- executable bootstrap scripts
- environment configuration management
- real Vtiger/OpenEMR connectivity
- health checks and smoke tests
- deployment automation
- repeatable worker/service startup

## Current gap

The project already has good documentation for ops and deployment strategy, but much less executable implementation than the app/backend layers.

## Remaining work to complete Phase B

### Environment automation
- Makefile or equivalent command surface
- bootstrap/init scripts
- Vtiger customization apply scripts
- OpenEMR customization apply scripts
- platform deploy scripts

### Integration hardening
- real auth/token handling against Vtiger/OpenEMR
- connectivity validation
- retry tuning against real upstream behavior
- adapter configuration by environment

### Deployment controls
- Docker compose or equivalent local environment
- CI/CD workflow hardening
- environment-level health checks
- smoke test scripts

### Configuration and secrets
- config loading conventions
- secret injection strategy
- safe defaults for local development
- environment templates

## Definition of done for Phase B

Phase B is complete when:
- a new environment can be bootstrapped from scripts
- services and worker can start reliably from config
- Vtiger and OpenEMR connectivity is validated in non-local environments
- smoke tests can verify system health after deployment
- no environment depends on undocumented manual configuration

## Recommended next tasks for Phase B
1. executable bootstrap scripts
2. Makefile / task runner
3. health + smoke tests
4. real adapter auth/connectivity
5. CI/CD and deploy workflow
