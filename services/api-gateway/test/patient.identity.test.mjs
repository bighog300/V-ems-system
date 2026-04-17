import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-patient-test-"));
  return join(dir, "platform.sqlite");
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

async function startServerWithOpenemrTransport(transport) {
  const dbPath = createDbPath();
  const orchestration = new OrchestrationService({
    dbPath,
    openemr: {
      searchPatient: (payload) => transport({ method: "searchPatient", payload }),
      createPatient: (payload) => transport({ method: "createPatient", payload })
    }
  });

  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, base: `http://127.0.0.1:${port}` };
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

test("patient search path routes through orchestration OpenEMR adapter", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    calls.push(request);
    return { match_status: "matched_existing", match_confidence: 0.99, patient_id: "OE-001", candidates: [{ patient_id: "OE-001", display_name: "Jane Doe" }] };
  });

  try {
    const response = await jsonFetch(base, "/api/patients/search", {
      method: "POST",
      body: JSON.stringify({ first_name: "Jane", last_name: "Doe", dob: "1990-01-01" })
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.match_status, "matched_existing");
    assert.equal(response.body.patient_id, "OE-001");
    assert.deepEqual(calls, [{ method: "searchPatient", payload: { first_name: "Jane", last_name: "Doe", dob: "1990-01-01" } }]);
  } finally {
    server.close();
  }
});

test("patient create path routes through orchestration OpenEMR adapter", async () => {
  const calls = [];
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    calls.push(request);
    return { patient_id: "OE-002", display_name: "John Smith" };
  });

  try {
    const response = await jsonFetch(base, "/api/patients", {
      method: "POST",
      body: JSON.stringify({ first_name: "John", last_name: "Smith", dob: "1988-03-15", sex: "male" })
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.patient_id, "OE-002");
    assert.deepEqual(calls, [{ method: "createPatient", payload: { first_name: "John", last_name: "Smith", dob: "1988-03-15", sex: "male" } }]);
  } finally {
    server.close();
  }
});

test("patient link persistence stores provisional and verified states on incident", async () => {
  const { server, base, orchestration } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "searchPatient") return { match_status: "no_match", match_confidence: 0, candidates: [] };
    return { patient_id: "OE-003", display_name: "Pat Example" };
  });

  try {
    const incidentResponse = await createDefaultIncident(base);
    const incidentId = incidentResponse.body.incident_id;

    const provisional = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "provisional", temporary_label: "Unknown Male" })
    });
    assert.equal(provisional.status, 200);
    assert.equal(provisional.body.verification_status, "provisional");

    const verified = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-003" })
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.verification_status, "verified");
    assert.equal(verified.body.openemr_patient_id, "OE-003");

    const persisted = orchestration.getPatientLink(incidentId);
    assert.equal(persisted.verification_status, "verified");
    assert.equal(persisted.openemr_patient_id, "OE-003");
  } finally {
    server.close();
  }
});

test("patient link read by incident returns persisted status summary", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));
  try {
    const incidentResponse = await createDefaultIncident(base);
    const incidentId = incidentResponse.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-777" })
    });

    const readResponse = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`);
    assert.equal(readResponse.status, 200);
    assert.equal(readResponse.body.incident_id, incidentId);
    assert.equal(readResponse.body.verification_status, "verified");
    assert.equal(readResponse.body.openemr_patient_id, "OE-777");
  } finally {
    server.close();
  }
});

test("patient link read by incident returns 404 when no link is persisted", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async () => ({ ok: true }));
  try {
    const incidentResponse = await createDefaultIncident(base);
    const incidentId = incidentResponse.body.incident_id;

    const readResponse = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`);
    assert.equal(readResponse.status, 404);
    assert.equal(readResponse.body.error.code, "NOT_FOUND");
    assert.match(readResponse.body.error.message, new RegExp(`Patient link for incident ${incidentId} not found`));
  } finally {
    server.close();
  }
});

test("ambiguous match does not auto-link patient without explicit selection", async () => {
  const { server, base, orchestration } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "searchPatient") {
      return {
        match_status: "ambiguous",
        match_confidence: 0.65,
        patient_id: null,
        candidates: [
          { patient_id: "OE-101", display_name: "Alex Doe" },
          { patient_id: "OE-102", display_name: "Alex D." }
        ]
      };
    }
    return { patient_id: "OE-999", display_name: "Unused" };
  });

  try {
    const incidentResponse = await createDefaultIncident(base);
    const incidentId = incidentResponse.body.incident_id;

    const search = await jsonFetch(base, "/api/patients/search", {
      method: "POST",
      body: JSON.stringify({ first_name: "Alex", last_name: "Doe", dob: "1992-08-20" })
    });

    assert.equal(search.status, 200);
    assert.equal(search.body.match_status, "ambiguous");
    assert.equal(search.body.patient_id, null);
    assert.equal(search.body.candidates.length, 2);
    assert.equal(orchestration.patientLinks.findByIncidentId(incidentId), undefined);
  } finally {
    server.close();
  }
});
