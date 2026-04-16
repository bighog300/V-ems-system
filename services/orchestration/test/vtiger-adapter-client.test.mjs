import test from "node:test";
import assert from "node:assert/strict";
import { VtigerAdapterClient } from "../src/adapters/vtiger/vtiger-adapter-client.mjs";

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
