import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() {
  return new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-audit-report-")), "platform.sqlite") });
}

async function createIncident(s, meta, overrides = {}) {
  return s.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Audit exercise", address: "1 Main St", patient_count: 1, ...overrides }
  }, meta);
}

test("audit() records the acting actor_id alongside every entry", async () => {
  const s = service();
  const incident = await createIncident(s, { correlationId: "c1", actorId: "STAFF-100" });

  const report = await s.getAuditLogReport({});
  const entry = report.entries.find((e) => e.entity_type === "incident" && e.entity_id === incident.incident_id);
  assert.ok(entry);
  assert.equal(entry.actor_id, "STAFF-100");
  assert.equal(entry.action, "create_incident");
  assert.equal(entry.correlation_id, "c1");
});

test("audit() tolerates meta with no actorId, leaving actor_id null (the pre-13f historical case)", async () => {
  const s = service();
  const incident = await createIncident(s, { correlationId: "c2" });

  const report = await s.getAuditLogReport({});
  const entry = report.entries.find((e) => e.entity_type === "incident" && e.entity_id === incident.incident_id);
  assert.ok(entry);
  assert.equal(entry.actor_id, null);
});

test("getAuditLogReport filters by entity_type, entity_id and actor_id", async () => {
  const s = service();
  const incidentA = await createIncident(s, { correlationId: "c3", actorId: "STAFF-A" });
  const incidentB = await createIncident(s, { correlationId: "c4", actorId: "STAFF-B" });
  await s.createPersonnel({ staff_id: "STAFF-200", display_name: "Crew", role: "Paramedic", operational_status: "Available", home_station: "Test" }, { correlationId: "c5", actorId: "STAFF-A" });

  const byEntityType = await s.getAuditLogReport({ entityType: "personnel" });
  assert.equal(byEntityType.entries.length, 1);
  assert.equal(byEntityType.entries[0].entity_id, "STAFF-200");

  const byEntityId = await s.getAuditLogReport({ entityType: "incident", entityId: incidentA.incident_id });
  assert.equal(byEntityId.entries.length, 1);
  assert.equal(byEntityId.entries[0].entity_id, incidentA.incident_id);

  const byActor = await s.getAuditLogReport({ actorId: "STAFF-A" });
  assert.equal(byActor.entries.length, 2);
  assert.ok(byActor.entries.every((e) => e.actor_id === "STAFF-A"));
  assert.ok(!byActor.entries.some((e) => e.entity_id === incidentB.incident_id));
});

test("getAuditLogReport paginates newest-first with a keyset cursor that covers every row exactly once", async () => {
  const s = service();
  for (let n = 0; n < 5; n++) {
    await createIncident(s, { correlationId: `c-${n}`, actorId: "STAFF-PAGE" }, { description: `Exercise ${n}` });
  }

  const firstPage = await s.getAuditLogReport({ actorId: "STAFF-PAGE", limit: 2 });
  assert.equal(firstPage.entries.length, 2);
  assert.equal(firstPage.has_more, true);
  assert.ok(firstPage.next_before_id);

  const secondPage = await s.getAuditLogReport({ actorId: "STAFF-PAGE", limit: 2, beforeId: firstPage.next_before_id });
  assert.equal(secondPage.entries.length, 2);
  assert.equal(secondPage.has_more, true);

  const thirdPage = await s.getAuditLogReport({ actorId: "STAFF-PAGE", limit: 2, beforeId: secondPage.next_before_id });
  assert.equal(thirdPage.entries.length, 1);
  assert.equal(thirdPage.has_more, false);
  assert.equal(thirdPage.next_before_id, null);

  const allIds = [...firstPage.entries, ...secondPage.entries, ...thirdPage.entries].map((e) => e.id);
  assert.equal(new Set(allIds).size, 5);
  // Newest-first and strictly decreasing across page boundaries.
  assert.deepEqual(allIds, [...allIds].sort((a, b) => b - a));
});

test("getAuditLogReport filters by an ISO-8601 timestamp range", async () => {
  const s = service();
  const incident = await createIncident(s, { correlationId: "c-range", actorId: "STAFF-RANGE" });
  await s.db.execute(`UPDATE audit_logs SET timestamp='2026-06-01T00:00:00Z' WHERE entity_type='incident' AND entity_id='${incident.incident_id}';`);

  const inRange = await s.getAuditLogReport({ from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" });
  assert.ok(inRange.entries.some((e) => e.entity_id === incident.incident_id));

  const outOfRange = await s.getAuditLogReport({ from: "2027-01-01T00:00:00Z" });
  assert.ok(!outOfRange.entries.some((e) => e.entity_id === incident.incident_id));
});
