# Stage 11 — Mobile-Native Field Capabilities and UX: Execution Plan

Tracking: issue [#68](https://github.com/bighog300/v-ems-system/issues/68). Builds on
`apps/mobile-crew`'s Stage 9 foundation and Stage 10's offline-first sync (outbox,
encrypted local storage, read-path cache, sync engine).

This is the milestone-level "what order, what's in scope, what's deferred" layer —
issue #68 already carries the full task/acceptance-criteria checklist and isn't
repeated here.

## Where Stage 10 leaves off

The app now charts a full PCR offline and syncs it exactly once on reconnect. What it
still can't do: draw a real signature (today's `PatientCaseDetailScreen` explicitly notes
"a typed attestation for now"), capture a photo or scanned document, scan a barcode
instead of typing a medication/procedure name, record where care happened, notify a
crew member of a new assignment without opening the app, or re-lock/re-verify identity
tuned for realistic field handling of the device. Stage 11 is a UX/hardware-integration
stage, not an architecture stage — nothing here changes the outbox/sync contracts Stage
10 built; every new mutating write follows the same `requestOrQueue` pattern already
established.

## Design decisions

Four scope-boundary questions were resolved before starting:

### Signature capture: pure RN gestures + SVG, not a third-party library

Same reasoning as Stage 10's encryption choice: Expo's managed workflow (ADR 0001)
should stay native-config-free. A `PanResponder` capturing touch points, rendered as an
SVG path (`react-native-svg`, already a transitive dependency via
`@react-navigation/elements`) and exported to a PNG data URI via `react-native-view-shot`
or an SVG-to-PNG rasterizer, needs no native config plugin. **Decided**: pure
gesture+SVG canvas, not `react-native-signature-canvas` or similar.

### Attachments: capture + local encrypted queue now, server sync deferred to Stage 12

Stage 12 is what actually builds encrypted object storage; there is nowhere durable to
sync a photo to yet. Building a throwaway server storage endpoint now to delete once
Stage 12 ships is wasted work. **Decided**: Stage 11 builds capture (camera + document
picker) and a local encrypted attachment queue, structurally identical to the outbox
pattern (`offline/attachmentStore.ts` alongside `offline/outboxStore.ts`) but holding
file references instead of JSON payloads. The actual upload/sync wiring is explicitly
out of scope here and becomes a Stage 12 follow-up once object storage exists.

### Push notifications: full stack, including the backend trigger

"Push assignment notifications" isn't done if only the client can receive a push nobody
ever sends. **Decided**: build both sides — a push-token registry endpoint in
`services/api-gateway`/`services/orchestration`, a send-on-assignment-change trigger
using Expo's push service, and the mobile client's registration/foreground/background
handling.

### Barcode/QR: capture the code as a text reference, no catalog lookup yet

The Vtiger-backed stock-item schema has no barcode/SKU field today; adding one is a
schema-and-data-entry change on the operational side, not a mobile UI change.
**Decided**: a scan pre-fills a text field on the medication/procedure form with the
scanned code (auditable, useful today); resolving a scan to a real stock-item record is
a follow-up once stock items carry a barcode field.

## Milestones

Same incremental-PR pattern as Stages 9–10 — each step is independently reviewable and
testable.

1. **11a — Signature canvas.** `src/components/SignaturePad.tsx`: raw touch-responder
   handlers (not `PanResponder.create` — this only ever needs one active touch's
   location, and the raw handlers are simpler to test) capture points rendered live as an
   SVG path, exported via `react-native-svg`'s `toDataURL` as a PNG data URI. Wired into
   `EpcrScreen`'s sign step as an optional addition to the existing typed
   signer-identity/attestation flow — drawing is never required, so nothing regresses for
   a signer who can't perform the gesture. No backend change needed at all: Stage 8's
   `epcr_signatures` schema already had `signature_method`/`signature_image_ref` columns
   and the handler already read `payload.signature_method`/`payload.signature_image_ref`,
   unused until now.
2. **11b — Rapid repeat-entry UX.** A "Repeat last vitals" quick-fill on `VitalsScreen`
   (pre-fills the form from the most recent observation for fast serial re-entry — the
   standard every-5-minutes EMS vitals pattern) and equivalent one-tap repeat affordances
   for common medications/procedures on `InterventionsScreen`. Pure UI/UX, no new API
   surface — still calls the same `createPatientCaseObservation`/
   `createPatientCaseMedication`/`createPatientCaseProcedure`.
3. **11c — Location context.** `expo-location`, with an explicit permission-rationale
   affordance (`LocationPermissionNotice` — our own explanatory text before the OS prompt,
   never a bare system dialog) satisfying "privacy controls." Location is captured at
   encounter start and disposition, stored as lat/lon + accuracy fields on those existing
   payloads. Denying permission never blocks charting — `captureLocation()` only ever
   reads the *current* permission state and never itself triggers the OS prompt, so it
   can't interrupt a charting action; the same "never block charting" principle Stage 10
   established for connectivity applies here to permissions. Required a small backend
   addition (migration 011): `patient_case_encounter_links` and `patient_case_dispositions`
   gained nullable `location_lat`/`location_lng`/`location_accuracy_m` columns — both
   tables are local-only (never sent to OpenEMR), and the fields are deliberately excluded
   from each endpoint's idempotency fingerprint so GPS jitter on a queued retry can never
   trigger a false "reused with a different request" conflict.
4. **11d — Attachment capture (camera/document) + local queue.** `src/offline/db.ts`
   gains an `attachments` table (per-patient-case, indexed on `patient_case_id`) and
   `src/offline/attachmentStore.ts` reuses the outbox's `encryptJson`/`decryptJson`
   device-key crypto — a base64-encoded file is just another JSON-serializable string —
   to encrypt captured content before it ever touches SQLite; `listAttachments` returns
   metadata only, decryption happens on demand via `getAttachmentContent`.
   `src/attachments/captureAttachment.ts` wraps `expo-image-picker` (camera, permission
   requested inline at the point of use) and `expo-document-picker` +
   `expo-file-system` (document read, since the document picker has no base64 option).
   Surfaced on `PatientCaseDetailScreen` as an "Attachments" card ("Take photo"/"Add
   document" plus a captured-files list). No server upload yet (see design decision
   above) — entries sit queued until Stage 12 adds a sync path.
5. **11e — Barcode/QR scanning.** `src/scanning/BarcodeScannerModal.tsx`: a full-screen
   modal wrapping `expo-camera`'s `CameraView`/`useCameraPermissions`, requesting camera
   access at the point of use (same standard as photo capture in 11d — opening the
   scanner already states the intent). A "Scan" button next to the medication/procedure
   name field on `InterventionsScreen` opens it; a scanned code fills that same text
   field, once per scan, rather than resolving to a catalog record. No backend change.
6. **11f — Push assignment notifications.** Backend: a `device_push_tokens` table +
   registration endpoint, and a send-on-assignment-create/reassign trigger using Expo's
   push service (`expo-server-sdk`). Mobile: `expo-notifications` permission request,
   token registration on sign-in, and foreground/background notification handling that
   deep-links into the relevant `IncidentDetail`/`JobsList` screen.
7. **11g — Biometric re-entry and device identity refinement.** Extends Stage 9's
   `AppLockScreen`/`expo-local-authentication` hook: a stable per-install device
   identifier (`expo-application`'s installation id) attached to the session and to the
   push-token registration from 11f, laying the groundwork for Stage 12's
   device/session-revocation requirement without building revocation itself yet.
8. **11h — Tablet/phone layout pass, accessibility polish, and vendor-neutral hardware
   hooks.** Extends Stage 9's existing `theme/a11y.ts` responsive-width work across the
   screens 11a–11g just added. Adds a `src/integrations/deviceImport.ts` interface stub
   (a typed contract for "import a structured reading from an external device") with no
   real vendor implementation — satisfies "vendor-neutral hooks for future
   monitor/defibrillator imports" as a seam, not a feature.

## Exit gate

Per issue #68: physical Android/iOS devices completing realistic field workflows with
attachments, notifications, and rapid clinical entry, online and offline. Like Stage
10's 10h, this needs real hardware this sandbox can't provide — flagged the same way for
follow-up outside this environment once 11a–11h are merged.
