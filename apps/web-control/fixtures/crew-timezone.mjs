import assert from "node:assert/strict";
import {
  renderCrewIncidentDetailHtml, buildCreateEncounterPayload,
  buildCreateObservationPayload, buildCreateInterventionPayload, buildCreateHandoverPayload
} from "../src/crew.mjs";

const cases = JSON.parse(process.argv[2]);
const summary = {
  assignmentSummary: {}, patientLinkSummary: { openemrPatientId: "P-1" },
  encounterSummary: { available: true }, handoverSummary: { available: false }
};
for (const { local, utc } of cases) {
  for (const [build, field] of [
    [buildCreateEncounterPayload, "care_started_at"],
    [buildCreateObservationPayload, "recorded_at"],
    [buildCreateInterventionPayload, "performed_at"],
    [buildCreateHandoverPayload, "handover_time"]
  ]) {
    const result = build(new Map([[field, local]]), { nowMs: Date.parse(utc) });
    assert.equal(result.payload[field], utc, `${process.env.TZ}: ${field} ${local}`);
    assert.ok(!result.validationErrors.some(error => error.includes("future")));
    // Already qualified instants must not receive a second timezone adjustment.
    assert.equal(build(new Map([[field, utc]])).payload[field], utc);
    assert.equal(build(new Map([[field, "2026-04-16T10:15:00+05:30"]])).payload[field], "2026-04-16T04:45:00.000Z");
    if (process.env.TZ === "Europe/London") {
      // Spring-forward gap follows browser Date semantics: 01:30 becomes 02:30 BST.
      assert.equal(build(new Map([[field, "2026-03-29T01:30"]])).payload[field], "2026-03-29T01:30:00.000Z");
    }
  }
  assert.ok(buildCreateObservationPayload(new Map([["recorded_at", local]]), {
    nowMs: Date.parse(utc) - 1
  }).validationErrors.includes("recorded_at cannot be in the future."));
  const html = renderCrewIncidentDetailHtml(summary, { now: new Date(utc) });
  for (const field of ["recorded_at", "performed_at", "handover_time"]) {
    assert.ok(html.includes(`name="${field}" type="datetime-local" value="${local}"`));
  }
  const encounterHtml = renderCrewIncidentDetailHtml({ ...summary, encounterSummary: { available: false } }, { now: new Date(utc) });
  assert.ok(encounterHtml.includes(`name="care_started_at" type="datetime-local" value="${local}"`));
}
