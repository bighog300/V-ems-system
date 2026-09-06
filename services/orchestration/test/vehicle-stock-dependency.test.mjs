import test from "node:test";
import assert from "node:assert/strict";
import { resolveVehicleStockDependencies } from "../src/sync-worker-service.mjs";

function repos(vehicle, item) {
  return [
    { findByVehicleId: () => vehicle },
    { findByStockItemId: () => item }
  ];
}

test("vehicle-stock dependency resolves persisted vems identifiers and remote references", () => {
  const [vehicles, items] = repos({ remote_id: "37x1", sync_status: "succeeded" }, { remote_id: "40x1", sync_status: "succeeded" });
  const result = resolveVehicleStockDependencies({ vems_vehicle_id: "AMB-964", vems_stock_item_id: "ITEM-964" }, vehicles, items);
  assert.equal(result.vehicleId, "AMB-964");
  assert.equal(result.stockItemId, "ITEM-964");
  assert.equal(result.vehicle.remote_id, "37x1");
  assert.equal(result.item.remote_id, "40x1");
});

for (const [name, vehicle, item] of [
  ["missing vehicle link", undefined, { remote_id: "40x1", sync_status: "succeeded" }],
  ["missing stock-item link", { remote_id: "37x1", sync_status: "succeeded" }, undefined],
  ["non-succeeded vehicle link", { remote_id: "37x1", sync_status: "retrying" }, { remote_id: "40x1", sync_status: "succeeded" }]
]) {
  test(`vehicle-stock dependency rejects ${name}`, () => {
    const [vehicles, items] = repos(vehicle, item);
    assert.throws(() => resolveVehicleStockDependencies({ vems_vehicle_id: "AMB-964", vems_stock_item_id: "ITEM-964" }, vehicles, items), (error) => error.code === "VTIGER_DEPENDENCY_PENDING");
  });
}
