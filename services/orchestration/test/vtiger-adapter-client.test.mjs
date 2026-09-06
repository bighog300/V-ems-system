import test from "node:test";
import assert from "node:assert/strict";
import { VtigerAdapterClient } from "../src/adapters/vtiger/vtiger-adapter-client.mjs";
import { VtigerPayloadMapper } from "../src/adapters/vtiger/vtiger-payload-mapper.mjs";

test("vtiger adapter methods route mapped payloads through transport", async () => {
  const calls = [];
  const mapper = {
    mapIncidentCreate: (incident) => ({ id: incident.incident_id, type: "incident-create" }),
    mapIncidentUpdate: (incident) => ({ id: incident.incident_id, type: "incident-update" }),
    mapAssignmentCreate: (assignment) => ({ id: assignment.assignment_id, type: "assignment-create" }),
    mapAssignmentUpdate: (assignment) => ({ id: assignment.assignment_id, type: "assignment-update" }),
    mapStockUsageRecord: (usage) => ({ id: usage.stock_item_id, type: "stock-usage-record" })
  };

  const client = new VtigerAdapterClient({
    mapper,
    transport: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });

  await client.createIncidentMirror({ incident_id: "INC-000001" });
  await client.updateIncidentMirror({ incident_id: "INC-000001" });
  await client.createAssignmentMirror({ assignment_id: "ASN-000001" });
  await client.updateAssignmentMirror({ assignment_id: "ASN-000001" });
  await client.recordStockUsageMirror({ stock_item_id: "ITEM-000001" });

  assert.deepEqual(calls, [
    { method: "createIncidentMirror", payload: { id: "INC-000001", type: "incident-create" } },
    { method: "updateIncidentMirror", payload: { id: "INC-000001", type: "incident-update" } },
    { method: "createAssignmentMirror", payload: { id: "ASN-000001", type: "assignment-create" } },
    { method: "updateAssignmentMirror", payload: { id: "ASN-000001", type: "assignment-update" } },
    { method: "recordStockUsageMirror", payload: { id: "ITEM-000001", type: "stock-usage-record" } }
  ]);
});

test("vtiger adapter without transport fails explicitly", async () => {
  const client = new VtigerAdapterClient();
  await assert.rejects(() => client.createIncidentMirror({ incident_id: "INC-000001" }), /not configured/);
});

test("stock adapters propagate the configured Vtiger owner on mapped payloads", async () => {
  const previous = process.env.VTIGER_ASSIGNED_USER_ID;
  process.env.VTIGER_ASSIGNED_USER_ID = "19x5";
  const calls = [];
  const client = new VtigerAdapterClient({ mapper: new VtigerPayloadMapper(), transport: async (request) => { calls.push(request); return { ok: true }; } });
  await client.createStockItemMirror({ stock_item_id: "ITEM-1" });
  await client.updateStockItemMirror({ stock_item_id: "ITEM-1" });
  await client.createVehicleStockMirror({ vehicle_id: "AMB-1", stock_item_id: "ITEM-1" });
  await client.updateVehicleStockMirror({ vehicle_id: "AMB-1", stock_item_id: "ITEM-1" });
  assert.equal(calls.length, 4);
  for (const call of calls) assert.equal(call.payload.assigned_user_id, "19x5");
  if (previous === undefined) delete process.env.VTIGER_ASSIGNED_USER_ID;
  else process.env.VTIGER_ASSIGNED_USER_ID = previous;
});
