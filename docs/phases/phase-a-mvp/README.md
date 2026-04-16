# Phase A — Usable MVP

## Goal

Deliver a fully usable operational MVP suitable for realistic workflow validation, internal demos, and supervised pilot use in non-production settings.

## Phase intent

Phase A is about proving the product works end to end for core users:
- dispatchers
- ambulance crews
- supervisors reviewing closure readiness

## Scope already achieved

### Backend
- incident lifecycle
- assignment lifecycle
- patient link flow
- encounter creation
- observation/intervention/handover write flows
- closure-readiness enforcement
- sync worker foundation
- stock intent emission from interventions

### UI
- dispatcher board
- incident detail view
- crew job list
- crew incident detail
- real crew-side encounter/observation/intervention/handover forms
- incident close action

## Remaining work to complete Phase A

### Dispatcher experience
- add filtering by status, priority, active only
- add simple sorting controls
- add polling/live refresh

### Crew experience
- clearer workflow progression cues
- better summary/timeline presentation
- focused integration-style tests for encounter/observation/intervention/handover flows

### Product hardening
- browser/DOM-level integration tests for critical UI flows
- stronger feedback states for success/error/loading where useful
- minor visual polish for operational readability

## Definition of done for Phase A

Phase A is complete when:
- dispatcher can discover and inspect incidents without manual workarounds
- crew can complete the full clinical workflow from encounter through handover
- incident can be closed operationally when valid
- the main happy path works consistently in backend and UI
- the system is demoable and usable under supervision

## Recommended immediate next tasks
1. dispatcher board filtering
2. dispatcher polling/live refresh
3. close-flow frontend integration test
4. crew-flow frontend integration tests
5. timeline/progression polish in crew incident detail
