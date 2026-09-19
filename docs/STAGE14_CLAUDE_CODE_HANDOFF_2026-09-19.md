# VEMS Stage 14 Claude Code Handoff

Date: 2026-09-19

## Repository state

- Branch: `stage14/field-validation-release-readiness`
- Previous checkpoint: `5454c28 fix(stage14): complete patient identity emulator acceptance`
- Current HEAD before this checkpoint: `5454c28748dd4bd8e1521343af4cbabdb2bf1767`
- Authoritative SQLite: `/home/bighog/repos/vems/V-ems-system/services/api-gateway/.data/platform.sqlite`
- Protected local files, never stage:
  - `infra/.env.development`
  - `infra/.env.development.bak`

## Completed acceptance

Stage 14 evidence recorded in the execution report includes Android debug
build/install and React Native bundle loading, ordinary issued-token
authentication, development-only test-session login with release guards,
session persistence/restart/sign-out behavior, and Section A assignment,
incident, and PCR navigation.

Section B evidence covers multi-patient/provisional recovery and isolation.
C1 passed: PCR-000001 is linked to exactly one isolated OpenEMR Stage/Alpha
patient. PCR-000002 and its existing link are unchanged. PCR-000003 is absent.

## Current C2 durable state

- Exactly one PCR-000001 encounter.
- Exactly one primary-survey assessment.
- Zero observations.
- Zero observation audit/timeline events.
- PCR-000002 unchanged.
- PCR-000003 absent.
- SQLite `PRAGMA integrity_check` is `ok`.
- No medications, procedures, disposition, handover, signatures, or
  finalization have started.

The encounter and assessment are completed records. Do not recreate, edit, or
repeat them.

## Implemented fixes and tooling

The current worktree contains the following Stage 14 work:

- Persistent development JWT signing-secret support for repeatable API
  restarts.
- Invalid/stale SecureStore session recovery with sanitized invalid-session
  handling and development-only test login.
- Patient-create form/actionable-parent and testability corrections.
- Observation form lifecycle and testability corrections.
- One-shot scrolling/form visibility behavior and keyboard-safe submit state.
- Synchronous pending state and duplicate-submit protection.
- Node and Python Stage 14 diagnostic harnesses.
- Maestro 2.10.0 preparation, navigation dry-run, and continuous observation
  mutation flows.
- Exactly-one mutation safeguards, startup extended waits, and direct-device
  selection corrections.

The continuous mutation wrapper uses the preparation subflow and has exactly
one `observation-submit` tap with no retry, repeat, or restart construct.

## Current blocker

Maestro can control the emulator through the direct local WSL ADB transport.
The local WSL ADB device serial is `172.22.96.1:15555`. Direct-device
stability checks, hierarchy dumps, and screenshots passed. `adb reverse`
through this TCP transport listed mappings but did not carry emulator HTTP
traffic to WSL processes; the required emulator-side probes produced no HTTP
output and no matching API request.

The next approved approach is direct emulator-to-WSL networking:

- API: rediscovered current WSL IPv4, port 3001, listening on `0.0.0.0`.
- Metro: rediscovered current WSL IPv4, port 8082, listening on `0.0.0.0`.

This direct-network approach has not yet been executed. C2 observation
mutation has not occurred. Previous C2 attempts produced zero submit requests,
observation rows, and observation audit/timeline events. Do not recreate the
encounter or assessment.

## Persistent host topology

- Isolated OpenEMR Windows port: 8085.
- WSL OpenEMR relay: `172.22.96.1:18085` to Windows `127.0.0.1:8085`.
- Retained Windows ADB-server relay: `172.22.96.1:15037` to Windows
  `127.0.0.1:5037`.
- Direct emulator transport relay: `172.22.96.1:15555` to Windows
  `127.0.0.1:5555`.
- Firewall rules are restricted to the current WSL subnet.
- Shared OpenEMR on port 8083 must remain untouched.
- Rediscover the current WSL IP and subnet after every reboot; do not assume
  `172.22.96.1` survives.

## Persistent local credentials

- Reusable OpenEMR OAuth credential:
  `/home/bighog/.local/state/vems-stage14/openemr-oauth.env`
- Reusable Stage 14 JWT signing secret:
  `/home/bighog/.local/state/vems-stage14/jwt-signing-secret`
- Parent directory mode: 0700.
- Credential file modes: 0600.

Never commit, print, log, or copy these values to the clipboard. The broad
OpenEMR client registry allowance remains a least-privilege follow-up; issued
token scopes are constrained.

## Exact next action for Claude Code

1. Read repository guidance and the full Stage 14 execution report.
2. Audit branch/status and protected files.
3. Rediscover the current WSL IPv4.
4. Recover retained services without recreation.
5. Start API/Metro on `0.0.0.0` using direct WSL ports.
6. Connect local WSL ADB to `172.22.96.1:15555`.
7. Prove emulator direct HTTP access to WSL API and Metro.
8. Pass the direct API URL to Maestro through a non-secret flow environment
   variable.
9. Run a connectivity-only login/assignments gate.
10. Confirm one encounter, one assessment, and zero observations.
11. Execute the continuous observation flow once.
12. Never retry after a submit tap or ambiguous result.
13. Reconcile Android, API, OpenEMR, SQLite, and audit evidence.
14. Stop before later clinical sections.

## Validation status

Latest focused validation passed:

- Mobile TypeScript typecheck.
- Mobile unit suite: 218 tests.
- Affected component suite: 15 tests.
- Focused API encounter/observation suite: 21 tests.
- Focused orchestration observation/adaptor suite: 12 tests.
- Maestro syntax checks: preparation, navigation dry-run, and mutation flows.
- SQLite integrity and `git diff --check`.

Previously recorded full results remain documented in the execution report:
component 80, unit 40, Node harness 34, Python harness 13, API 134, and
orchestration 28. The direct emulator acceptance remains blocked before C2
observation dispatch.

## Safety rules

Do not:

- Clear Android application data or SecureStore.
- Delete or recreate Docker volumes.
- Touch shared OpenEMR 8083.
- Stage `infra/.env.development` or `infra/.env.development.bak`.
- Print secrets, tokens, authorization headers, passwords, or private keys.
- Substitute direct API calls for rendered UI acceptance.
- Repeat an ambiguous clinical mutation.
- Push, merge, tag, or publish without explicit user approval.
