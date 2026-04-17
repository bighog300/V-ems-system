import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-id-generation-test-"));
  return join(dir, "platform.sqlite");
}

function createIncidentPayload(description) {
  return {
    call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
    incident: {
      category: "medical_emergency",
      priority: "critical",
      description,
      address: "Main St",
      patient_count: 1
    }
  };
}

test("incident IDs remain unique and monotonic even after deleting highest record", () => {
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const first = orchestration.createIncident(createIncidentPayload("First"), { correlationId: "corr-id-1" });
  const second = orchestration.createIncident(createIncidentPayload("Second"), { correlationId: "corr-id-2" });

  orchestration.db.execute(`DELETE FROM incidents WHERE incident_id = '${second.incident_id}';`);

  const third = orchestration.createIncident(createIncidentPayload("Third"), { correlationId: "corr-id-3" });

  assert.equal(first.incident_id, "INC-000001");
  assert.equal(second.incident_id, "INC-000002");
  assert.equal(third.incident_id, "INC-000003");
});

test("assignment IDs remain unique across rapid create calls", () => {
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const incident = orchestration.createIncident(createIncidentPayload("Assignments"), { correlationId: "corr-id-assignment-1" });

  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const assignment = orchestration.createAssignment(incident.incident_id, {
      vehicle_id: `AMB-${100 + i}`,
      crew_ids: [`STAFF-${100 + i}`],
      reason: "dispatch"
    }, { correlationId: `corr-id-assignment-${i + 2}` });
    ids.push(assignment.assignment_id);
  }

  assert.deepEqual(ids, ["ASN-000001", "ASN-000002", "ASN-000003", "ASN-000004", "ASN-000005"]);
  assert.equal(new Set(ids).size, ids.length);
});
