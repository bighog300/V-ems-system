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

test("openemr payload mapper maps intervention create request/response", () => {
  const mapper = new OpenEmrPayloadMapper();
  const request = mapper.mapInterventionCreateRequest({
    encounter_id: "ENC-720",
    incident_id: "INC-000001",
    patient_id: "OE-720",
    performed_at: "2026-04-16T10:10:00Z",
    type: "medication",
    name: "Aspirin",
    dose: "300mg",
    route: "oral",
    response: "pain reduced",
    stock_item_id: "ITEM-001"
  });
  const response = mapper.mapInterventionCreateResponse({
    intervention_id: "INT-720",
    encounter_id: "ENC-720",
    status: "recorded",
    ignored: true
  });

  assert.deepEqual(request, {
    encounter_id: "ENC-720",
    incident_id: "INC-000001",
    patient_id: "OE-720",
    performed_at: "2026-04-16T10:10:00Z",
    type: "medication",
    name: "Aspirin",
    dose: "300mg",
    route: "oral",
    response: "pain reduced",
    stock_item_id: "ITEM-001"
  });
  assert.deepEqual(response, { intervention_id: "INT-720", encounter_id: "ENC-720", status: "recorded" });
});

test("openemr payload mapper maps handover create request/response", () => {
  const mapper = new OpenEmrPayloadMapper();
  const request = mapper.mapHandoverCreateRequest({
    encounter_id: "ENC-730",
    incident_id: "INC-000001",
    patient_id: "OE-730",
    handover_time: "2026-04-16T10:30:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Patel",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Care handed over"
  });
  const response = mapper.mapHandoverCreateResponse({
    handover_id: "HND-730",
    encounter_id: "ENC-730",
    handover_time: "2026-04-16T10:30:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Patel",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Care handed over",
    ignored: true
  });

  assert.deepEqual(request, {
    encounter_id: "ENC-730",
    incident_id: "INC-000001",
    patient_id: "OE-730",
    handover_time: "2026-04-16T10:30:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Patel",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Care handed over"
  });
  assert.deepEqual(response, {
    handover_id: "HND-730",
    encounter_id: "ENC-730",
    handover_time: "2026-04-16T10:30:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Patel",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Care handed over"
  });
});
