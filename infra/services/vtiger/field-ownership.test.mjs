import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFieldOwnership } from "./validate-field-ownership.mjs";

const schema = JSON.parse(readFileSync(new URL("./development/modules.json", import.meta.url), "utf8"));
const registry = JSON.parse(readFileSync(new URL("./field-ownership.json", import.meta.url), "utf8"));

test("every provisioned field has an explicit owner", () => {
  assert.deepEqual(validateFieldOwnership(schema, registry), []);
  const expanded = structuredClone(schema);
  expanded.VEMSVehicles.push("vems_new_service_status");
  assert.match(validateFieldOwnership(expanded, registry).join("\n"), /VEMSVehicles.vems_new_service_status/);
});

test("unrecognized ownership classes fail the contract", () => {
  const changed = structuredClone(registry);
  changed.modules.VEMSAssignments.fields.vems_status = "vtiger_command";
  assert.match(validateFieldOwnership(schema, changed).join("\n"), /VEMSAssignments.vems_status/);
});
