import test from "node:test";
import assert from "node:assert/strict";
import { referenceNemsisProfile } from "../src/compliance/profiles/reference-nemsis.mjs";
import { validateAgainstProfile, resolveCode } from "../src/compliance/compliance-profile.mjs";

// A minimal stand-in for the shape epcr-finalization.mjs's snapshot()
// actually produces (patient_case/incident/demographics/assessments/
// disposition/...) -- this profile's requiredFields are written against
// that real shape specifically so wiring it into finalization in
// milestone 13c is a call-site change, not a profile redesign.
function completeTransportedSnapshot() {
  return {
    demographics: { first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", sex: "female", unidentified: false },
    incident: { category: "medical_emergency", address: "1 Main St" },
    assessments: [{ section_type: "primary_survey" }],
    disposition: { outcome: "transported", destination_facility: "General Hospital" }
  };
}

test("reference profile validates a complete transported case as ready", () => {
  const result = validateAgainstProfile(referenceNemsisProfile, completeTransportedSnapshot());
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
});

test("reference profile flags a missing transport destination only for transported/transferred outcomes", () => {
  const transported = completeTransportedSnapshot();
  delete transported.disposition.destination_facility;
  assert.deepEqual(validateAgainstProfile(referenceNemsisProfile, transported).missing.map((m) => m.id), ["transport_destination"]);

  const refused = completeTransportedSnapshot();
  refused.disposition = { outcome: "refusal_transport" };
  const refusedResult = validateAgainstProfile(referenceNemsisProfile, refused);
  assert.ok(!refusedResult.missing.some((m) => m.id === "transport_destination"), "destination isn't required for a refusal");
});

test("reference profile does not require patient name for an unidentified patient", () => {
  const unidentified = completeTransportedSnapshot();
  unidentified.demographics = { unidentified: true, dob: "1990-01-01", sex: "unknown" };
  const result = validateAgainstProfile(referenceNemsisProfile, unidentified);
  assert.ok(!result.missing.some((m) => m.id === "patient_first_name" || m.id === "patient_last_name"));
});

test("reference profile flags every missing core field on an empty record", () => {
  const result = validateAgainstProfile(referenceNemsisProfile, {});
  const missingIds = result.missing.map((m) => m.id);
  // Name is only required when identified -- appliesWhen(undefined
  // demographics) evaluates !record?.demographics?.unidentified === true,
  // so on a wholly empty record it's still expected to be required.
  assert.ok(missingIds.includes("patient_first_name"));
  assert.ok(missingIds.includes("incident_complaint"));
  assert.ok(missingIds.includes("primary_assessment"));
  assert.ok(missingIds.includes("disposition_outcome"));
  // No disposition at all -> not transported -> destination not required.
  assert.ok(!missingIds.includes("transport_destination"));
});

test("reference profile's outcome code list matches the disposition outcome values already used by the mobile app", () => {
  const outcomeLabels = referenceNemsisProfile.codeLists.outcome.map((entry) => entry.label);
  for (const outcome of ["transported", "treated_not_transported", "refusal_assessment", "refusal_treatment", "refusal_transport", "no_patient_found", "left_scene", "transfer_other_provider", "cancelled_before_contact", "death_on_scene", "resuscitation_terminated"]) {
    assert.ok(outcomeLabels.includes(outcome), `expected outcome code list to include "${outcome}"`);
  }
});

test("reference profile resolves a charted medication name to its canonical code", () => {
  assert.equal(resolveCode(referenceNemsisProfile, "medication", "naloxone")?.code, "M-NAL");
  assert.equal(resolveCode(referenceNemsisProfile, "medication", "Narcan")?.code, "M-NAL");
  assert.equal(resolveCode(referenceNemsisProfile, "medication", "Some Unlisted Drug"), null);
});

test("every required field's path resolves against the actual epcr-finalization snapshot shape", async () => {
  // Guards against the profile drifting out of sync with the real
  // snapshot() shape in services/orchestration/src/epcr-finalization.mjs
  // -- every top-level segment this profile's paths reference must be one
  // of the keys that function actually produces.
  const { canonicalize } = await import("../src/epcr-finalization.mjs");
  const snapshotShapeKeys = Object.keys(canonicalize({
    patient_case: {}, incident: {}, patient_link: {}, encounter_link: {},
    demographics: {}, assessments: [], observations: [], medications: [],
    procedures: [], disposition: {}, timeline: []
  }));
  for (const field of referenceNemsisProfile.requiredFields) {
    const [topLevelKey] = field.path.split(".");
    assert.ok(snapshotShapeKeys.includes(topLevelKey), `required field "${field.id}" references top-level key "${topLevelKey}", which snapshot() does not produce`);
  }
});
