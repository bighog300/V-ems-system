import assert from "node:assert/strict";
import { test } from "node:test";

import { recordTelemetryEvent, resetTelemetrySink, setTelemetrySink, type TelemetryEvent } from "../src/telemetry/telemetry.ts";

function withCapturedEvents(fn: () => void): Array<{ event: TelemetryEvent; timestamp: string }> {
  const captured: Array<{ event: TelemetryEvent; timestamp: string }> = [];
  setTelemetrySink({ record: (event, timestamp) => captured.push({ event, timestamp }) });
  try {
    fn();
  } finally {
    resetTelemetrySink();
  }
  return captured;
}

test("records an event's allowed fields and adds a timestamp", () => {
  const [captured] = withCapturedEvents(() => recordTelemetryEvent({ name: "sign_in_succeeded", role: "field_crew" }));
  assert.equal(captured.event.name, "sign_in_succeeded");
  assert.deepEqual(captured.event, { name: "sign_in_succeeded", role: "field_crew" });
  assert.equal(typeof captured.timestamp, "string");
  assert.ok(!Number.isNaN(Date.parse(captured.timestamp)));
});

test("records an event with no fields", () => {
  const [captured] = withCapturedEvents(() => recordTelemetryEvent({ name: "app_launched" }));
  assert.deepEqual(captured.event, { name: "app_launched" });
});

test("records a numeric-field event exactly", () => {
  const [captured] = withCapturedEvents(() =>
    recordTelemetryEvent({ name: "sync_cycle_completed", attempted: 5, acknowledged: 3, retrying: 1, failed: 1, conflicted: 0 })
  );
  assert.deepEqual(captured.event, { name: "sync_cycle_completed", attempted: 5, acknowledged: 3, retrying: 1, failed: 1, conflicted: 0 });
});

test("PHI-safety: a field not in the allowlist for that event is dropped even if attached at runtime", () => {
  const tampered = { name: "sign_in_succeeded", role: "field_crew", patient_name: "Jane Doe" } as unknown as TelemetryEvent;
  const [captured] = withCapturedEvents(() => recordTelemetryEvent(tampered));
  assert.deepEqual(captured.event, { name: "sign_in_succeeded", role: "field_crew" });
  assert.equal("patient_name" in captured.event, false);
});

test("PHI-safety: an event name outside the known allowlist carries no fields through", () => {
  const unknown = { name: "unknown_event", secret_token: "abc123" } as unknown as TelemetryEvent;
  const [captured] = withCapturedEvents(() => recordTelemetryEvent(unknown));
  assert.deepEqual(captured.event, { name: "unknown_event" });
});

test("setTelemetrySink/resetTelemetrySink swap the destination without affecting redaction", () => {
  const events: TelemetryEvent[] = [];
  setTelemetrySink({ record: (event) => events.push(event) });
  recordTelemetryEvent({ name: "api_error", path: "/api/incidents/INC-000001", status: 500, code: "DOWNSTREAM_UNAVAILABLE" });
  resetTelemetrySink();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { name: "api_error", path: "/api/incidents/INC-000001", status: 500, code: "DOWNSTREAM_UNAVAILABLE" });
});
