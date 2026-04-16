import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-encounter-test-"));
  return join(dir, "platform.sqlite");
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options
  });
  return { status: response.status, body: await response.json() };
}

async function startServerWithOpenemrTransport(transport, dbPath = createDbPath()) {
  const orchestration = new OrchestrationService({
    dbPath,
    openemr: {
      searchPatient: (payload) => transport({ method: "searchPatient", payload }),
      createPatient: (payload) => transport({ method: "createPatient", payload }),
      createEncounter: (payload) => transport({ method: "createEncounter", payload }),
      createObservation: (payload) => transport({ method: "createObservation", payload }),
      createIntervention: (payload) => transport({ method: "createIntervention", payload })
    }
  });

  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, dbPath, base: `http://127.0.0.1:${port}` };
}

async function createDefaultIncident(base) {
  return jsonFetch(base, "/api/incidents", {
    method: "POST",
    body: JSON.stringify({
      call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
      incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
    })
  });
}

test("encounter create success path", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    calls.push(request);
    if (request.method === "createEncounter") return { encounter_id: "ENC-100", status: "Open" };
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-100" })
    });

    const created = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-100",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.encounter_id, "ENC-100");
    assert.equal(created.body.linked_incident_id, incidentId);
    assert.deepEqual(calls, [{
      method: "createEncounter",
      payload: {
        incident_id: incidentId,
        patient_id: "OE-100",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      }
    }]);
  } finally {
    server.close();
  }
});

test("encounter create rejected when no linked patient", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ encounter_id: "ENC-101", status: "Open" }));

  try {
    const incident = await createDefaultIncident(base);
    const rejected = await jsonFetch(base, `/api/incidents/${incident.body.incident_id}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-100",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });

    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error.code, "CONFLICT");
  } finally {
    server.close();
  }
});

test("encounter create allows provisional patient-link state for emergency workflow", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") return { encounter_id: "ENC-150", status: "Open" };
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "provisional", openemr_patient_id: "OE-150" })
    });

    const created = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-150",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.encounter_id, "ENC-150");
  } finally {
    server.close();
  }
});

test("encounter create blocked for invalid patient-link verification state", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ encounter_id: "ENC-151", status: "Open" }));

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "duplicate_suspected", openemr_patient_id: "OE-151" })
    });

    const blocked = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-151",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });

    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, "INVALID_STATUS_TRANSITION");
  } finally {
    server.close();
  }
});

test("encounter link persistence survives restart and lookup by incident", async () => {
  const dbPath = createDbPath();
  const first = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") return { encounter_id: "ENC-200", status: "Open" };
    return { ok: true };
  }, dbPath);

  let incidentId;
  try {
    const incident = await createDefaultIncident(first.base);
    incidentId = incident.body.incident_id;
    await jsonFetch(first.base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-200" })
    });

    const created = await jsonFetch(first.base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-200",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });
    assert.equal(created.status, 201);
  } finally {
    first.server.close();
  }

  const second = await startServerWithOpenemrTransport(async () => ({ encounter_id: "ENC-XXX", status: "Open" }), dbPath);
  try {
    const persisted = await jsonFetch(second.base, `/api/incidents/${incidentId}/encounters`);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.encounter_id, "ENC-200");
    assert.equal(persisted.body.incident_id, incidentId);
    assert.equal(persisted.body.openemr_encounter_id, "ENC-200");
    assert.equal(persisted.body.encounter_id, "ENC-200");
    assert.equal(persisted.body.openemr_patient_id, "OE-200");
    assert.equal(persisted.body.encounter_status, "Open");
    assert.equal(persisted.body.care_started_at, "2026-04-16T10:15:00Z");
  } finally {
    second.server.close();
  }
});

test("encounter fetch returns 404 when no encounter is linked to incident", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));

  try {
    const incident = await createDefaultIncident(base);
    const response = await jsonFetch(base, `/api/incidents/${incident.body.incident_id}/encounters`);
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "NOT_FOUND");
  } finally {
    server.close();
  }
});

test("encounter fetch returns persisted linkage metadata", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") return { encounter_id: "ENC-400", status: "Ready for Handover" };
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-400" })
    });

    await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-400",
        care_started_at: "2026-04-16T12:00:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Headache"
      })
    });

    const fetched = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body, {
      incident_id: incidentId,
      openemr_encounter_id: "ENC-400",
      encounter_id: "ENC-400",
      openemr_patient_id: "OE-400",
      encounter_status: "Ready for Handover",
      care_started_at: "2026-04-16T12:00:00Z"
    });
  } finally {
    server.close();
  }
});

test("intervention create success path", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    calls.push(request);
    if (request.method === "createEncounter") return { encounter_id: "ENC-500", status: "Open" };
    if (request.method === "createIntervention") return { intervention_id: "INT-500", encounter_id: "ENC-500", status: "recorded" };
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-500" })
    });

    await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-500",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      })
    });

    const created = await jsonFetch(base, "/api/encounters/ENC-500/interventions", {
      method: "POST",
      body: JSON.stringify({
        performed_at: "2026-04-16T10:20:00Z",
        type: "medication",
        name: "Aspirin",
        dose: "300mg",
        route: "oral",
        response: "pain reduced",
        stock_item_id: "ITEM-001"
      })
    });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { intervention_id: "INT-500", encounter_id: "ENC-500", status: "recorded" });
    assert.deepEqual(calls.at(-1), {
      method: "createIntervention",
      payload: {
        encounter_id: "ENC-500",
        incident_id: incidentId,
        patient_id: "OE-500",
        performed_at: "2026-04-16T10:20:00Z",
        type: "medication",
        name: "Aspirin",
        dose: "300mg",
        route: "oral",
        response: "pain reduced",
        stock_item_id: "ITEM-001"
      }
    });
  } finally {
    server.close();
  }
});

test("intervention create rejected if encounter does not exist", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));

  try {
    const rejected = await jsonFetch(base, "/api/encounters/ENC-404/interventions", {
      method: "POST",
      body: JSON.stringify({
        performed_at: "2026-04-16T10:20:00Z",
        type: "medication",
        name: "Aspirin"
      })
    });

    assert.equal(rejected.status, 404);
    assert.equal(rejected.body.error.code, "NOT_FOUND");
  } finally {
    server.close();
  }
});

test("intervention payload validation failures return structured envelope", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));

  try {
    const invalidType = await jsonFetch(base, "/api/encounters/ENC-100/interventions", {
      method: "POST",
      body: JSON.stringify({
        performed_at: "2026-04-16T10:20:00Z",
        type: "bad-type",
        name: "Aspirin"
      })
    });
    assert.equal(invalidType.status, 400);
    assert.equal(invalidType.body.error.code, "INVALID_PAYLOAD");

    const unknownField = await jsonFetch(base, "/api/encounters/ENC-100/interventions", {
      method: "POST",
      body: JSON.stringify({
        performed_at: "2026-04-16T10:20:00Z",
        type: "medication",
        name: "Aspirin",
        extra: true
      })
    });
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.error.code, "INVALID_PAYLOAD");
  } finally {
    server.close();
  }
});

test("duplicate encounter create is idempotent by incident linkage", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") {
      calls.push(request);
      return { encounter_id: "ENC-300", status: "Open" };
    }
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-300" })
    });

    const body = JSON.stringify({
      patient_id: "OE-300",
      care_started_at: "2026-04-16T10:15:00Z",
      crew_ids: ["STAFF-001"],
      presenting_complaint: "Chest pain"
    });

    const createdA = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, { method: "POST", body });
    const createdB = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, { method: "POST", body });

    assert.equal(createdA.status, 201);
    assert.equal(createdB.status, 201);
    assert.equal(createdA.body.encounter_id, createdB.body.encounter_id);
    assert.equal(calls.length, 1);
  } finally {
    server.close();
  }
});

test("observation create success path", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    calls.push(request);
    if (request.method === "createEncounter") return { encounter_id: "ENC-500", status: "Open" };
    if (request.method === "createObservation") return { observation_id: "OBS-500", encounter_id: "ENC-500", status: "recorded" };
    return { ok: true };
  });

  try {
    const incident = await createDefaultIncident(base);
    const incidentId = incident.body.incident_id;
    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-500" })
    });
    await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-500",
        care_started_at: "2026-04-16T12:00:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Headache"
      })
    });

    const created = await jsonFetch(base, "/api/encounters/ENC-500/observations", {
      method: "POST",
      body: JSON.stringify({
        recorded_at: "2026-04-16T12:05:00Z",
        source: "manual",
        vital_signs: {
          systolic_bp_mmhg: 120,
          diastolic_bp_mmhg: 80
        }
      })
    });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body, { observation_id: "OBS-500", encounter_id: "ENC-500", status: "recorded" });
    assert.equal(calls.at(-1).method, "createObservation");
    assert.deepEqual(calls.at(-1).payload, {
      encounter_id: "ENC-500",
      incident_id: incidentId,
      patient_id: "OE-500",
      recorded_at: "2026-04-16T12:05:00Z",
      source: "manual",
      vital_signs: {
        systolic_bp_mmhg: 120,
        diastolic_bp_mmhg: 80
      }
    });
  } finally {
    server.close();
  }
});

test("observation create rejected if encounter does not exist", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));
  try {
    const missing = await jsonFetch(base, "/api/encounters/ENC-999/observations", {
      method: "POST",
      body: JSON.stringify({
        recorded_at: "2026-04-16T12:05:00Z",
        vital_signs: { temperature_c: 37.1 }
      })
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "NOT_FOUND");
  } finally {
    server.close();
  }
});

test("observation payload validation failures", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));
  try {
    const badEncounterId = await jsonFetch(base, "/api/encounters/bad-id/observations", {
      method: "POST",
      body: JSON.stringify({
        recorded_at: "2026-04-16T12:05:00Z",
        vital_signs: { temperature_c: 37.1 }
      })
    });
    assert.equal(badEncounterId.status, 400);
    assert.equal(badEncounterId.body.error.code, "INVALID_PAYLOAD");

    const emptyPayload = await jsonFetch(base, "/api/encounters/ENC-123/observations", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.equal(emptyPayload.status, 400);
    assert.equal(emptyPayload.body.error.code, "INVALID_PAYLOAD");

    const invalidFieldType = await jsonFetch(base, "/api/encounters/ENC-123/observations", {
      method: "POST",
      body: JSON.stringify({
        recorded_at: "2026-04-16T12:05:00Z",
        vital_signs: { temperature_c: "37.1" }
      })
    });
    assert.equal(invalidFieldType.status, 400);
    assert.equal(invalidFieldType.body.error.code, "INVALID_PAYLOAD");

    const missingRequiredField = await jsonFetch(base, "/api/encounters/ENC-123/observations", {
      method: "POST",
      body: JSON.stringify({ vital_signs: { heart_rate_bpm: 92 } })
    });
    assert.equal(missingRequiredField.status, 400);
    assert.equal(missingRequiredField.body.error.code, "INVALID_PAYLOAD");
  } finally {
    server.close();
  }
});
