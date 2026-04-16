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
