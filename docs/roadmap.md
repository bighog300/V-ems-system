# VEMS Roadmap Summary

> **Superseded (was current as of 2026-04-17).** This described Phase A/B/C of the
> original operational platform build-out. That work is done — Vtiger and native
> OpenEMR integration, dispatcher/crew UI, and the multi-patient clinical record are
> all merged. The live roadmap is now [`EPCR_MOBILE_COMPLETION_PLAN.md`](EPCR_MOBILE_COMPLETION_PLAN.md)
> (ePCR Stages 6–14), tracked under issue [#72](https://github.com/bighog300/v-ems-system/issues/72).

## Original content (historical, Phase A/B/C — completed)

### Current position (as of 2026-04-17)

The project is at the end of **Phase A functional core** and moving toward Phase A completion plus the early work of Phase B.

### Recommended order of execution

#### Complete Phase A
1. dispatcher filtering
2. dispatcher live refresh
3. close-flow UI integration test
4. crew-flow UI integration tests
5. crew timeline/progression polish

#### Begin Phase B
1. bootstrap scripts
2. Makefile/task commands
3. health and smoke tests
4. real adapter connectivity
5. CI/CD hardening

#### Move into Phase C
1. observability
2. RBAC/security
3. load testing
4. supervisor/logistics surfaces
5. production support readiness

### Guiding principle

Do not overbuild Phase C before Phase B is executable. The current system is strong at application logic, but deployment and operational automation are the largest remaining gap.

---

## Current roadmap (see EPCR_MOBILE_COMPLETION_PLAN.md for full detail)

Phases A–C above are complete: Vtiger/OpenEMR integration, dispatcher/crew UI, and
Docker/CI baseline are in place. Work has moved to ePCR Stages 6–14:

| Stage | Scope | Status |
|---|---|---|
| 6 | Multi-patient patient-case domain | Closed |
| 7 | Complete clinical ePCR record | Closed |
| 8 | Signatures, finalization, amendments, QA | Open |
| 9 | Native crew mobile app foundation | Open |
| 10 | Offline-first sync | Open |
| 11 | Mobile-native field UX/hardware | Open |
| 12 | Production clinical infrastructure (Postgres, encrypted storage, DR) | Open |
| 13 | Compliance, reporting, clinical governance | Open |
| 14 | Field validation and release readiness | Open |

The largest remaining gaps are the native mobile app (Stages 9–11), production
infrastructure hardening (Stage 12), and compliance/reporting (Stage 13) — none of
which has started yet.
