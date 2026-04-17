# Ambulance Platform

Operational and clinical orchestration platform for an emergency ambulance service. A mashup integrating **Vtiger** (operational management) and **OpenEMR** (clinical data) with a custom orchestration platform.

## 📋 Quick Overview

| Aspect | Details |
|--------|---------|
| **Tech Stack** | JavaScript (92.6%), HTML (4.4%), Shell (2%) |
| **Architecture** | Microservices with API gateway, adapters, and orchestration |
| **Primary Systems** | Vtiger CRM, OpenEMR, Custom control platform |
| **Deployment** | Docker-based, supports development, staging, production |

## 🎯 Core Systems

- **Vtiger**: Operational workflow, calls, incidents, dispatch, vehicles, stock, personnel
- **OpenEMR**: Patient identity, encounters, observations, interventions, handover  
- **Custom Platform**: Control UI, crew app, orchestration engine, data sync, dashboards

## 📁 Repository Structure

```
├── docs/                    # Complete documentation
│   ├── build-pack/         # Human-readable design & build docs
│   ├── specs/              # Machine-readable contracts (source of truth)
│   └── root-legacy/        # Legacy docs archive
├── apps/                    # Frontend applications
├── services/               # Backend services
├── packages/               # Shared code & utilities
├── db/                     # Database migrations & seeds
└── infra/                  # Docker & CI/CD configuration
```

## 🚀 Getting Started

### Prerequisites

- Node.js (specify version)
- Docker & Docker Compose
- Make
- Environment-specific configuration files

### Installation

**1) Bootstrap the environment (run once)**
```bash
make bootstrap
```

**2) Start all services**
```bash
make start-env ENV=development
```

**3) Verify setup with smoke tests**
```bash
make smoke ENV=development
```

**4) Run full test suite**
```bash
npm test
```

### Stopping Services
```bash
make stop-env
```

## 🏗️ Build Phases

The platform is built incrementally across 9 phases:

1. Shared types and configuration
2. API gateway skeleton
3. Orchestration skeleton
4. Vtiger and OpenEMR adapters
5. Incident and assignment workflows
6. Web control UI
7. Mobile crew application UI
8. Stock, readiness, and maintenance modules
9. Testing and hardening

## ⚙️ Configuration & Environment

### Environment Files
- `env/development.env` — Default development settings
- `env/staging.env` — Staging profile with RBAC enforcement enabled
- `env/development.local.env` — Optional local overrides (loaded after development.env)

### Service-Specific Startup
```bash
make start-api ENV=development      # API only
make start-web ENV=development      # Web UI only
make start-worker ENV=development   # Sync worker only
```

## 🔗 Integration & Connectivity

### Offline Development (Default)
Smoke tests run in offline-safe mode and do **not** require live Vtiger/OpenEMR systems.

### Staging with Upstream Connectivity
Enable optional connectivity checks when external systems are reachable:
```bash
SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY=true make smoke ENV=staging
```

### Validation Only
Run just connectivity checks:
```bash
make validate-connectivity ENV=staging
```

### RBAC Testing
Staging profile enables RBAC enforcement (`RBAC_ENFORCE=true`) to validate representative role-based access control behavior.

## 📖 Documentation

- **Build Pack**: See `docs/build-pack/` for canonical design and implementation guides
- **Machine Contracts**: See `docs/specs/` for authoritative build contracts
- **Sprint Execution**: See `docs/` for sprint planning and Codex execution prompts

### Key Documents
- `docs/build-pack/00-platform-build-pack.md` — Platform architecture
- `docs/build-pack/01-data-handoff-matrix.md` — Data flows
- `docs/build-pack/03-role-permissions-matrix.md` — RBAC configuration
- `docs/build-pack/04-api-integration-spec.md` — API specifications

## 🤝 Contributing

(Add your contribution guidelines here)

### Code Standards
- JavaScript (primary), HTML, and Shell scripts
- Follow established patterns in `packages/` and `services/`
- Add tests for new features
- Update documentation in `docs/build-pack/`

### Pull Request Process
1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Submit PR with clear description
5. Request review from maintainers

## 🧪 Testing

**Smoke Tests** (quick validation):
```bash
make smoke ENV=development
```

**Full Test Suite**:
```bash
npm test
```

**Integration Tests** (with upstream systems):
```bash
SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY=true make smoke ENV=staging
```

## 📋 License

(Add license information - currently no license specified)

## 📝 Notes

This starter bundle is designed to be imported into GitHub and used with AI-assisted execution tools. Refer to sprint execution documents in `docs/` for step-by-step development guidance.