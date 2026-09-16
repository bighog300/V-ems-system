import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

const meta = { correlationId: "search-test", actorId: "STAFF-001", actorRole: "field_crew" };

function service(searchResult) {
  const calls = [];
  const s = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-patient-search-")), "platform.sqlite"),
    openemr: {
      searchPatient: async (payload) => { calls.push(payload); return searchResult; }
    }
  });
  return { service: s, calls };
}

test("searchPatient forwards identity_number, hospital_card_number and address through to the OpenEMR adapter unchanged", async () => {
  const { service: s, calls } = service({ match_status: "no_match", match_confidence: 0, candidates: [] });

  await s.searchPatient({ identity_number: "ID-4471829" }, meta);
  await s.searchPatient({ hospital_card_number: "HC-208831" }, meta);
  await s.searchPatient({ first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", address: "1400 Riverside Dr" }, meta);

  assert.deepEqual(calls, [
    { identity_number: "ID-4471829" },
    { hospital_card_number: "HC-208831" },
    { first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", address: "1400 Riverside Dr" }
  ]);
});

test("searchPatient audits the search with a meaningful entity_id, preferring identity_number, then hospital_card_number, then phone, then last_name", async () => {
  const { service: s } = service({ match_status: "no_match", match_confidence: 0, candidates: [] });

  await s.searchPatient({ identity_number: "ID-4471829", phone: "555-0100", last_name: "Lovelace" }, meta);
  await s.searchPatient({ hospital_card_number: "HC-208831", phone: "555-0100" }, meta);
  await s.searchPatient({ phone: "555-0100", last_name: "Lovelace" }, meta);
  await s.searchPatient({ last_name: "Lovelace" }, meta);
  await s.searchPatient({ address: "1400 Riverside Dr" }, meta);

  const auditReport = await s.getAuditLogReport({ entityType: "patient", action: "search_patient" });
  const entityIds = auditReport.entries.map((e) => e.entity_id).reverse();
  assert.deepEqual(entityIds, ["ID-4471829", "HC-208831", "555-0100", "Lovelace", "search"]);
});
