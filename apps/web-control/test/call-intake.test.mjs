import test from "node:test";
import assert from "node:assert/strict";
import { buildCallIntakePayload, localDateTimeValue } from "../src/call-intake.mjs";

function fields(overrides = {}) {
  const values = {
    call_source: "phone", received_at: "2026-09-24T09:30", category: "trauma",
    priority: "high", description: "Road collision", address: "12 Main Street",
    patient_count: "2", ...overrides
  };
  return { get: (name) => values[name] };
}

test("call intake serializes browser-local time into an absolute API instant", () => {
  const { payload, errors } = buildCallIntakePayload(fields());
  assert.deepEqual(errors, []);
  assert.deepEqual(payload, {
    call: { call_source: "phone", received_at: new Date("2026-09-24T09:30").toISOString() },
    incident: { category: "trauma", priority: "high", description: "Road collision", address: "12 Main Street", patient_count: 2 }
  });
  assert.match(localDateTimeValue(new Date("2026-09-24T09:30:00Z")), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
});

test("call intake refuses missing location and invalid patient count before a write", () => {
  const { payload, errors } = buildCallIntakePayload(fields({ address: " ", patient_count: "2.5" }));
  assert.equal(payload, null);
  assert.match(errors.join(" "), /address/);
  assert.match(errors.join(" "), /non-negative whole number/);
});
