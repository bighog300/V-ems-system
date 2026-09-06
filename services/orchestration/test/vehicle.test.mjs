import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() { return new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-vehicle-test-")), "platform.sqlite") }); }
function incident(o) { return o.createIncident({ call: { call_source: "phone", received_at: "2026-09-06T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "test", address: "test", patient_count: 1 } }, { correlationId: "incident-correlation" }); }

const vehiclePayload = { vehicle_id: "AMB-901", callsign: "Unit 901", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Station 1", notes: "test" };

test("vehicle creation persists linkage state and idempotency fingerprint", () => {
  const o = service();
  const first = o.createVehicle(vehiclePayload, { correlationId: "vehicle-correlation", idempotencyKey: "vehicle-key" });
  const replay = o.createVehicle({ ...vehiclePayload, notes: "test" }, { correlationId: "replay-correlation", idempotencyKey: "vehicle-key" });
  assert.equal(replay.vehicle_id, first.vehicle_id);
  assert.equal(o.vehicleVtigerLinks.findByVehicleId(first.vehicle_id).sync_status, "pending");
  assert.throws(() => o.createVehicle({ ...vehiclePayload, notes: "different" }, { correlationId: "conflict", idempotencyKey: "vehicle-key" }), (error) => error.code === "CONFLICT");
});

test("assignment requires an available and serviceable registered vehicle", () => {
  const o = service();
  const i = incident(o);
  o.createVehicle(vehiclePayload, { correlationId: "vehicle-correlation" });
  const assignment = o.createAssignment(i.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-002", "STAFF-001"], reason: "dispatch" }, { correlationId: "assignment-correlation" });
  assert.deepEqual(assignment.crew_ids, ["STAFF-001", "STAFF-002"]);
  o.updateVehicle("AMB-901", { service_status: "Maintenance" }, { correlationId: "status-correlation" });
  assert.throws(() => o.createAssignment(i.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-003"], reason: "dispatch" }, { correlationId: "blocked" }), (error) => error.code === "CONFLICT");
});

test("vehicle mapper uses VEMSVehicles and stable identity fields", () => {
  const o = service();
  const mapped = o.vtigerMapper.mapVehicleCreate({ ...vehiclePayload, correlation_id: "corr", created_at: "2026-09-06T00:00:00.000Z", updated_at: "2026-09-06T00:00:00.000Z" });
  assert.equal(mapped.elementType, "VEMSVehicles");
  assert.equal(mapped.vems_vehicle_id, "AMB-901");
  assert.equal(mapped.vems_external_key, "vems:vehicle:AMB-901");
  assert.equal(mapped.vems_operational_status, "Available");
  assert.equal(mapped.vems_service_status, "Serviceable");
});
