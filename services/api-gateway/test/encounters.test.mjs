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
      createEncounter: (payload) => transport({ method: "createEncounter", payload })
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
      care_started_at: "2026-04-16T12:00:00Z",
      status: "Ready for Handover",
      linked_incident_id: incidentId
    });
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
