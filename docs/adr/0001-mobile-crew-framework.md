# ADR 0001: Mobile crew app framework

## Status
Accepted

## Context
Stage 9 (issue #66) requires a native Android/iOS crew ePCR client, `apps/mobile-crew`.
`docs/EPCR_MOBILE_COMPLETION_PLAN.md` names React Native/Expo as the default "unless an
ADR selects an alternative." This records that decision explicitly rather than leaving
it implicit.

## Decision
Use Expo (managed workflow) with React Native and TypeScript for `apps/mobile-crew`.

- Scaffolded via `create-expo-app`'s `blank-typescript` template (Expo SDK 57, React 19,
  React Native 0.86).
- `@react-navigation/native` + `@react-navigation/native-stack` for navigation.
- `expo-secure-store` for on-device secure token/session storage (iOS Keychain / Android
  Keystore-backed).
- Package named `@vems/mobile-crew` to match this monorepo's `@vems/*` convention, added
  to the existing root `apps/*` npm workspace — no separate toolchain or CI job needed.

## Rationale
- Matches what the completion plan already specified; no reason found during scaffolding
  to deviate.
- Expo's managed workflow gives Android + iOS builds from one codebase without needing
  platform-specific native projects checked in, which keeps Stage 9's "reproducible
  Android/iOS builds" requirement lightweight for a small team.
- TypeScript catches the kind of mistake (wrong field name on a session/API payload)
  that would otherwise only surface at runtime on a field device — worth it for an app
  handling clinical data entry, even though the rest of this monorepo is plain JS.
- `expo-secure-store` is the standard Expo-ecosystem answer to Stage 9's "secure token
  storage" requirement (Keychain/Keystore-backed, not AsyncStorage/localStorage).

## Consequences
- This is the first TypeScript and first React (Native) code in the repo — the rest of
  the monorepo (`services/*`, `apps/web-control`, `packages/shared`) is plain ESM
  JavaScript with no build step. `apps/mobile-crew` intentionally does not share that
  convention; it's an independent workspace with its own toolchain (Metro, Babel, tsc).
- Adds a large `node_modules` footprint (Expo + React Native + navigation + their
  transitive deps) to the monorepo install. No other workspace depends on
  `apps/mobile-crew`, so this doesn't affect backend or web-control installs, but it does
  make `npm ci` at the repo root slower.
- CI now runs `node --experimental-strip-types --test` for this workspace's logic-level
  unit tests (API client, session storage) rather than a full React Native component
  test harness (`jest-expo` etc.) — deferred; see "Not done in this milestone" below.
- Confirmed working in this environment: `npx expo export --platform android` bundles
  the app end to end (834 modules, no errors) via `EXPO_OFFLINE=1` (this sandbox's
  network policy blocks Expo CLI's telemetry/update-check calls, which isn't relevant to
  the bundle itself). Full device builds (`eas build` or local Android/iOS toolchains)
  were not exercised here and remain a Stage 9 task.

## Not done in this milestone
This ADR and the accompanying scaffold cover Stage 9 milestone 9a only:
framework choice, workspace scaffold, session bootstrap (paste-a-token sign-in, since no
login/OIDC-issuance endpoint exists yet — that's Stage 12), secure token storage, and a
placeholder home screen. Still open, tracked under issue #66:
- Encrypted local database for offline ePCR data (deferred to pair with Stage 10's
  offline-sync work, since an encrypted store designed before the sync/outbox model
  exists would likely need to be reshaped anyway).
- Assigned-jobs list, incident context, patient-case workflow, and the
  demographics/assessment/vitals/handover screens against the Stage 7/8 APIs.
- Biometric app-lock, accessibility/tablet layout work.
- Component/navigation test coverage beyond the current logic-level unit tests.
- Reproducible Android/iOS release builds.
