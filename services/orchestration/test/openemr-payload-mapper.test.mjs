import test from "node:test";
import assert from "node:assert/strict";
import { OpenEmrPayloadMapper } from "../src/adapters/openemr/openemr-payload-mapper.mjs";

test("openemr payload mapper maps encounter create request/response", () => {
  const mapper = new OpenEmrPayloadMapper();

  const request = mapper.mapEncounterCreateRequest({
    incident_id: "INC-000001",
    patient_id: "OE-700",
    care_started_at: "2026-04-16T10:00:00Z",
    crew_ids: ["STAFF-001", "STAFF-002"],
    presenting_complaint: "Dyspnea"
  });
  const response = mapper.mapEncounterCreateResponse({ encounter_id: "ENC-700", status: "Open", ignored: true });

  assert.deepEqual(request, {
    incident_id: "INC-000001",
    patient_id: "OE-700",
    care_started_at: "2026-04-16T10:00:00Z",
    crew_ids: ["STAFF-001", "STAFF-002"],
    presenting_complaint: "Dyspnea"
  });
  assert.deepEqual(response, { encounter_id: "ENC-700", status: "Open" });
});

test("openemr payload mapper maps observation create request/response", () => {
  const mapper = new OpenEmrPayloadMapper();
  const request = mapper.mapObservationCreateRequest({
    encounter_id: "ENC-710",
    incident_id: "INC-000001",
    patient_id: "OE-710",
    recorded_at: "2026-04-16T10:05:00Z",
    source: "monitor",
    notes: "Initial observation",
    vital_signs: { heart_rate_bpm: 88, respiratory_rate_bpm: 16 }
  });
  const response = mapper.mapObservationCreateResponse({
    observation_id: "OBS-710",
    encounter_id: "ENC-710",
    status: "recorded",
    ignored: true
  });

  assert.deepEqual(request, {
    encounter_id: "ENC-710",
    incident_id: "INC-000001",
    patient_id: "OE-710",
    recorded_at: "2026-04-16T10:05:00Z",
    source: "monitor",
    notes: "Initial observation",
    vital_signs: { heart_rate_bpm: 88, respiratory_rate_bpm: 16 }
  });
  assert.deepEqual(response, { observation_id: "OBS-710", encounter_id: "ENC-710", status: "recorded" });
});
