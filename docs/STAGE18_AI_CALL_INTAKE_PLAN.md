# Stage 18 — AI Voice/Text Call Intake: Milestone Plan

Follows Stage 17 (fleet GPS tracking and dispatch allocation, scoped but not yet
built).

## Why this stage exists, and what it is not

Today, an incident only exists in V-EMS if a human creates one — there is no intake
path at all yet (Stage 17's 17a closes the *UI* gap for a human dispatcher typing one
in; this stage adds a second, AI-assisted intake channel upstream of that same create
call). This stage adds AI agents that can hold a conversation — by phone (voice) or
through a public app (voice or text) — gather the information a dispatcher needs, and
produce a **draft** for a human to review, edit, and approve before it becomes a real,
dispatchable incident. The agent proposes; a human dispatcher decides. That gate is
non-negotiable and appears in every milestone below, not just as an exit-gate checkbox.

**This is explicitly NOT a 911/E911 replacement or emergency-dispatch system.** Real
E911/NG911 call handling is a certified, regulated telephony function (carrier
certification, location-routing obligations, licensed telecommunicator requirements
that vary by jurisdiction) that this stage does not attempt to be. This is a
**supplementary intake channel** — a non-emergency line, a public request/triage app,
or an after-hours overflow path — feeding the same human-gated queue a phone call to a
human call-taker would. Positioning it as anything closer to E911 than that is a
liability and safety problem, not just a scoping one; the product framing itself is a
design decision this plan treats as load-bearing, not a detail to sort out later.

**Out of scope, and why:**
- True E911/NG911 integration or replacing existing emergency phone lines. Different
  regulatory regime, different certification requirements, and a different risk
  profile than anything else in this codebase — not something to back into via a
  feature stage.
- Languages other than English. The user's requirement is English voice/text
  specifically; a real multi-language rollout needs its own STT/TTS/agent-prompt
  validation per language, not a checkbox on this plan.
- Choosing the actual telephony carrier, STT/TTS vendor, or public-app distribution
  mechanism (app store listing, etc.) here. These are real vendor/infrastructure
  decisions this plan flags as blocking inputs per milestone below, matching this
  codebase's established practice (15b's barcode symbology, 15g's LIFENET schema) of
  naming a real-world dependency rather than guessing it.

## Current state, grounded in the actual code

- **No intake path exists at all yet.** `POST /api/incidents` (call+incident payload,
  RBAC'd to `dispatcher`/`supervisor`/`operations_manager`/`sys_admin`) is the only way
  an incident is created, and — per the Stage 17 plan's own grounding — nothing in this
  codebase calls it today; Stage 17's 17a is the first *human* intake UI. This stage's
  drafts feed the exact same `POST /api/incidents` call unmodified once approved —
  no new incident-creation logic, just a new upstream source for its input.
- **The closest existing architectural precedent is the ePCR review lifecycle**, not
  the patient-identity "provisional" pattern. `services/orchestration/src/epcr-finalization.mjs`'s
  `reviewEpcr()` already has exactly the shape this stage needs: a reviewer takes an
  `action` (`accept`/`return_for_correction`/`request_clarification`/
  `flag_clinical_concern`/`finalize`) against something someone else produced, with a
  full audit trail and lifecycle-event log. A call-intake draft's review workflow
  (accept-and-create-incident / edit-then-approve / reject / request more information)
  mirrors this shape directly rather than inventing a new review pattern.
- **No telephony, STT, or TTS integration exists anywhere in this codebase.** Grepped
  for any existing voice/call/telephony reference beyond the crew app's own
  human-to-human features (push notifications, the `Navigate` deep link) — none found.
  This is genuinely new infrastructure, not an extension of something partially built.
- **The Claude API is well-suited to the dialogue-management/field-extraction half of
  this problem (turning a conversation into a structured draft via tool use) but does
  not itself provide telephony or speech-to-text/text-to-speech** — those are separate
  vendor integrations this plan treats as blocking inputs (18c), not features the
  agent framework supplies for free.
- **`services/orchestration/src/adapters/`'s adapter/mapper/transport pattern
  (OpenEMR, Vtiger, LIFENET) is the established shape for every external-vendor
  integration in this codebase** — the telephony and STT/TTS integrations in 18c
  follow it, mirroring 15g's LIFENET adapter precedent for "define our side of the
  boundary, leave the vendor-specific transport as a real, documented integration
  point" when the actual vendor/contract isn't chosen yet.

## Milestones

Same incremental-PR pattern as Stages 6–17 — each independently reviewable and
testable. 18a has no dependencies and is deliberately AI-free: it proves the
draft/review/approve data model and workflow against manually-created drafts before
any agent, telephony, or STT/TTS complexity enters the picture. 18b depends on 18a (the
agent needs somewhere to write its draft to) and is deliberately text-only, proving
the agent's dialogue/extraction competence before adding audio. 18c depends on 18b.
18d can be built alongside 18c but is called out as its own milestone because it is
the single most important safety feature in this stage, not a detail inside another
one. 18e depends on 18b/18c/18d. 18f depends on 18a and Stage 17's dispatcher console
work. 18g runs throughout but is named as its own milestone because, like Stage 14's
security/clinical-safety reviews, it needs a qualified reviewer this session cannot
stand in for.

1. **18a — Draft intake data model and human review workflow (no AI yet).** A new
   `call_intake_drafts` table (raw caller-provided fields, extraction confidence/
   completeness state, source channel, status) and a review lifecycle mirroring
   `reviewEpcr()`'s shape: `submit_draft` (from whatever produces it — manual entry for
   this milestone's own testing), `GET`/list for the dispatcher queue, and a
   `review_draft` action (`approve` — calls the existing `createIncident()` unmodified
   and links the draft to the resulting `incident_id`; `edit_and_approve`; `reject`;
   `request_more_info`), each producing its own audit-log entry via the existing
   `service.audit()` convention. RBAC matches incident creation
   (`dispatcher`/`supervisor`/`operations_manager`/`sys_admin`). Proves the
   human-approval gate works end-to-end before any agent exists to feed it.
2. **18b — Text-based AI intake agent (Claude, no telephony).** The dialogue-management
   agent: a Claude API integration (Messages API + tool use, following this
   repository's adapter pattern) with a tool to create/update a `call_intake_drafts`
   row via 18a's API, a system prompt scoped tightly to "gather what a dispatcher
   needs, do not diagnose, do not give medical advice beyond what's needed to keep the
   caller safe until a human responds, always disclose you are an automated system."
   Proven first over plain text (an internal test harness, not yet the public app) so
   the agent's competence at gathering complete/accurate fields and recognizing when
   it doesn't have enough information is validated independently of any telephony/audio
   failure mode. Depends on 18a.
3. **18c — Voice: telephony and speech-to-text/text-to-speech integration.** Wires
   18b's agent to real phone calls. **Blocking inputs, not guessed:** the telephony
   provider (a platform capable of receiving inbound PSTN calls and streaming audio,
   e.g. Twilio Voice/Media Streams or Amazon Connect — named by the deployment, not
   assumed here) and the STT/TTS vendor (could be the same platform's built-in
   transcription/speech synthesis, or a dedicated provider — also named by the
   deployment). Follows the adapter/transport pattern: a `TelephonyTransport`
   interface (mirroring 15e's `BleTransport`/15g's `LifenetTransport` precedent of
   defining V-EMS's side of the boundary and leaving the real vendor wiring as an
   explicit, tested-against-fakes integration point) handling call-answer, streaming
   audio in, and streaming synthesized speech out. Depends on 18b.
4. **18d — Emergency/distress detection and human-escalation fast path.** Its own
   milestone, not a checkbox inside 18c, because it's the most important safety
   property this stage has: a caller must be able to reach a live human immediately,
   at any point, by an obvious action (a spoken phrase, a button in the app) — and the
   system must itself detect likely-life-threatening severity from what the caller
   says and fast-track to a human rather than continuing a full structured-intake
   conversation. Defines what "fast-track" means concretely (immediate transfer/ring to
   a live queue, not just a flag set on the eventual draft) and requires this behavior
   to be validated against real transcripts/call recordings before any real-call
   rollout — the equivalent of Stage 14's physical-device validation bar, for
   conversational safety instead of hardware.
5. **18e — Public consumer app.** The "custom app that can be downloaded by the
   public," reusing 18b/18c's agent for a voice or text conversation, clearly labeled
   throughout as a non-emergency intake/triage channel (per this stage's own framing
   above) — not V-EMS's crew app (`apps/mobile-crew`) and not the dispatcher console,
   a distinct public-facing surface with its own anonymous/lightweight session model
   (no crew credentials, no RBAC role). **Blocking input, not guessed:** app-store
   distribution requirements for an app that requests microphone access and
   communicates with an emergency-adjacent service — real store-review policy this
   plan does not assume the answer to. Depends on 18b/18c/18d.
6. **18f — Dispatcher review console.** Extends Stage 17's dispatcher console (its
   17a call-intake UI is the natural sibling) with an AI-drafted-calls queue:
   transcript/summary display, the extracted-field editor, and the approve/edit/
   reject/request-more-info actions from 18a's review workflow. A drafted call
   surfaces in the same urgency-aware board Stage 17 builds, not a separate screen.
   Depends on 18a and Stage 17.
7. **18g — Compliance, recording retention, and safety review.** Named as its own
   milestone rather than folded elsewhere, matching Stage 14's non-functional-review
   precedent: call/session recording storage and retention policy, caller consent
   disclosure (recorded-line notice, automated-system disclosure — already required
   by 18b's system prompt, verified here rather than assumed), PHI handling for
   anything spoken on the call (this is real clinical-adjacent data the instant a
   caller mentions symptoms), and a qualified safety/legal review of the whole
   pipeline — a reviewer this session cannot stand in for, the same posture Stage 14
   already takes for its own security/clinical-safety reviews.

## Exit gate

- [ ] No incident is ever created from an AI-drafted call without an explicit human
      `approve`/`edit_and_approve` action (18a) — verified by a test asserting
      `createIncident()` is never reachable from any AI-agent code path directly.
- [ ] The text-only agent (18b) reliably gathers a complete, accurate draft on a
      representative conversation set, measured before any telephony work begins.
- [ ] A live caller can reach a human at any point in the call (18d), and the
      distress/escalation fast-path has been validated against real or realistic
      call transcripts, not just unit tests of the classifier in isolation.
- [ ] The public app (18e) clearly and consistently discloses it is a non-emergency,
      automated intake channel — not 911 — in-app, at call start, and in its store
      listing.
- [ ] The compliance/safety review (18g) is complete with sign-off, and every
      critical/high finding is resolved before any real-caller rollout — mirroring
      Stage 14's own bar, not a lighter one.

Stage 18 is complete only when every box above is checked — at which point the
platform can accept a call or request from the public, understand it, and hand a
human dispatcher a ready-to-approve draft, without ever taking the human out of the
loop on whether help actually gets dispatched.
