import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createOpenEmrTransportFromEnv, createVtigerTransportFromEnv, createLifenetTransportFromEnv } from "../src/adapters/transports.mjs";

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

test("openemr transport requires auth token when auth is required", () => {
  assert.throws(() => createOpenEmrTransportFromEnv({ OPENEMR_BASE_URL: "http://example.test" }), /OPENEMR_API_TOKEN/);
});

test("vtiger transport requires auth token when auth is required", () => {
  assert.throws(() => createVtigerTransportFromEnv({ VTIGER_BASE_URL: "http://example.test" }), /VTIGER_API_TOKEN/);
});

test("lifenet transport returns undefined when LIFENET_BASE_URL is not configured", () => {
  assert.equal(createLifenetTransportFromEnv({}), undefined);
});

test("lifenet transport requires an explicit case-vitals route -- no default is guessed", () => {
  assert.throws(() => createLifenetTransportFromEnv({ LIFENET_BASE_URL: "http://example.test" }), /LIFENET_CASE_VITALS_ROUTE/);
});

test("lifenet transport fetches the configured route with the case reference templated in and an auth header", async () => {
  let capturedRequest;
  await withServer((req, res) => {
    capturedRequest = { url: req.url, headers: req.headers };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ recorded_at: "2026-09-17T10:00:00.000Z", heart_rate_bpm: 88 }]));
  }, async (port) => {
    const transport = createLifenetTransportFromEnv({
      LIFENET_BASE_URL: `http://127.0.0.1:${port}`,
      LIFENET_CASE_VITALS_ROUTE: "/cases/:case_reference/vitals",
      LIFENET_API_TOKEN: "test-token"
    });

    const response = await transport({ method: "fetchCaseVitals", payload: { case_reference: "LP15-CASE-1" } });
    assert.deepEqual(response, [{ recorded_at: "2026-09-17T10:00:00.000Z", heart_rate_bpm: 88 }]);
  });
  assert.equal(capturedRequest.url, "/cases/LP15-CASE-1/vitals");
  assert.equal(capturedRequest.headers.authorization, "Bearer test-token");
});

test("lifenet transport rejects a method other than fetchCaseVitals", () => {
  const transport = createLifenetTransportFromEnv({ LIFENET_BASE_URL: "http://example.test", LIFENET_CASE_VITALS_ROUTE: "/cases/:case_reference/vitals" });
  return assert.rejects(transport({ method: "somethingElse", payload: {} }), /LIFENET route not configured/);
});

test("lifenet transport classifies downstream 5xx as unavailable", async () => {
  await withServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unavailable" }));
  }, async (port) => {
    const transport = createLifenetTransportFromEnv({
      LIFENET_BASE_URL: `http://127.0.0.1:${port}`,
      LIFENET_CASE_VITALS_ROUTE: "/cases/:case_reference/vitals"
    });

    await assert.rejects(
      transport({ method: "fetchCaseVitals", payload: { case_reference: "LP15-CASE-1" } }),
      (error) => error.classification === "DOWNSTREAM_UNAVAILABLE"
    );
  });
});

test("openemr transport classifies downstream auth failure", async () => {
  await withServer((req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  }, async (port) => {
    const transport = createOpenEmrTransportFromEnv({
      OPENEMR_BASE_URL: `http://127.0.0.1:${port}`,
      OPENEMR_API_TOKEN: "token"
    });

    await assert.rejects(
      transport({ method: "searchPatient", payload: { first_name: "Jane" } }),
      (error) => error.classification === "DOWNSTREAM_AUTH_FAILED"
    );
  });
});

test("vtiger transport classifies downstream 5xx as unavailable", async () => {
  await withServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unavailable" }));
  }, async (port) => {
    const transport = createVtigerTransportFromEnv({
      VTIGER_BASE_URL: `http://127.0.0.1:${port}`,
      VTIGER_API_TOKEN: "token"
    });

    await assert.rejects(
      transport({ method: "createIncidentMirror", payload: { incident_id: "INC-1" } }),
      (error) => error.classification === "DOWNSTREAM_UNAVAILABLE"
    );
  });
});

test("openemr transport supports configurable route path", async () => {
  await withServer((req, res) => {
    if (req.url === "/custom/search") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async (port) => {
    const transport = createOpenEmrTransportFromEnv({
      OPENEMR_BASE_URL: `http://127.0.0.1:${port}`,
      OPENEMR_API_TOKEN: "token",
      OPENEMR_ROUTE_SEARCH_PATIENT: "/custom/search"
    });

    const response = await transport({ method: "searchPatient", payload: {} });
    assert.equal(response.ok, true);
  });
});

test("native OpenEMR transport acquires OAuth password token and maps patient/encounter/intervention resources", async () => {
  const requests = [];
  await withServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/oauth/token") {
      res.end(JSON.stringify({ access_token: "opaque-test-token", token_type: "Bearer" }));
    } else if (req.url.startsWith("/apis/default/api/patient?") && req.method === "GET") {
      res.end(JSON.stringify({ data: [{ uuid: "pat-1", fname: "Jane", lname: "Doe" }] }));
    } else if (req.url === "/apis/default/api/patient" && req.method === "POST") {
      res.end(JSON.stringify({ data: { uuid: "pat-2", fname: "Jane", lname: "Doe" } }));
    } else if (req.url === "/apis/default/api/patient/pat-2/encounter" && req.method === "POST") {
      res.end(JSON.stringify({ data: { euuid: "enc-2" } }));
    } else if (req.url === "/apis/default/api/patient/pat-2/encounter/enc-2/soap_note" && req.method === "POST") {
      res.end(JSON.stringify({ sid: "soap-2", fid: "enc-2" }));
    } else {
      res.writeHead(404); res.end(JSON.stringify({ error: "not found" }));
    }
  }, async (port) => {
    const transport = createOpenEmrTransportFromEnv({
      OPENEMR_API_STYLE: "standard",
      OPENEMR_BASE_URL: `http://127.0.0.1:${port}`,
      OPENEMR_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
      OPENEMR_CLIENT_ID: "client",
      OPENEMR_CLIENT_SECRET: "secret",
      OPENEMR_USERNAME: "user",
      OPENEMR_PASSWORD: "pass",
      OPENEMR_USER_ROLE: "users"
    });
    const search = await transport({ method: "searchPatient", payload: { first_name: "Jane", last_name: "Doe" } });
    assert.equal(search.patient_id, "pat-1");
    const patient = await transport({ method: "createPatient", payload: { first_name: "Jane", last_name: "Doe", dob: "1990-01-01", sex: "Female" } });
    assert.equal(patient.patient_id, "pat-2");
    const encounter = await transport({ method: "createEncounter", payload: { patient_id: "pat-2", presenting_complaint: "fall" } });
    assert.equal(encounter.encounter_id, "enc-2");
    const intervention = await transport({ method: "createIntervention", payload: { patient_id: "pat-2", encounter_id: "enc-2", type: "treatment", name: "bandage", stock_item_id: "ITEM-1" } });
    assert.equal(intervention.intervention_id, "soap-2");
    assert.match(requests[0].body, /grant_type=password/);
    assert.match(requests[0].body, /api%3Aoemr/);
    assert.equal(requests.filter((request) => request.url === "/oauth/token").length, 1);
    assert.ok(requests.some((request) => request.url === "/apis/default/api/patient/pat-2/encounter/enc-2/soap_note"));
  });
});

test("vtiger transport enforces timeout", async () => {
  await withServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }, 75);
  }, async (port) => {
    const transport = createVtigerTransportFromEnv({
      VTIGER_BASE_URL: `http://127.0.0.1:${port}`,
      VTIGER_API_TOKEN: "token",
      VTIGER_TIMEOUT_MS: "20"
    });

    await assert.rejects(
      transport({ method: "createIncidentMirror", payload: { incident_id: "INC-1" } }),
      (error) => error.classification === "DOWNSTREAM_TIMEOUT"
    );
  });
});

test("native OpenEMR transport reads patient history: encounters by uuid, medications by the resolved numeric pid", async () => {
  const requests = [];
  await withServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("content-type", "application/json");
    if (req.url === "/oauth/token") return res.end(JSON.stringify({ access_token: "opaque-test-token", token_type: "Bearer" }));
    if (req.url === "/apis/default/api/patient/pat-1/encounter") return res.end(JSON.stringify({ data: [{ date: "2026-09-20 09:46:28", reason: "Chest pain", facility_name: "Dev Clinic" }, { date: "2026-08-01 10:00:00", reason: "Review", facility_name: null }] }));
    if (req.url === "/apis/default/api/patient/pat-1") return res.end(JSON.stringify({ data: { uuid: "pat-1", pid: 3 } }));
    if (req.url === "/apis/default/api/patient/3/medication") return res.end(JSON.stringify([{ title: "Aspirin", activity: 1, enddate: null }, { title: "Warfarin", activity: "0", enddate: "2020-01-01 00:00:00" }])); // the real list route returns a bare array
    res.writeHead(404); res.end(JSON.stringify({ error: "not found" }));
  }, async (port) => {
    const transport = createOpenEmrTransportFromEnv({
      OPENEMR_API_STYLE: "standard", OPENEMR_BASE_URL: `http://127.0.0.1:${port}`, OPENEMR_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
      OPENEMR_CLIENT_ID: "client", OPENEMR_CLIENT_SECRET: "secret", OPENEMR_USERNAME: "user", OPENEMR_PASSWORD: "pass", OPENEMR_USER_ROLE: "users"
    });
    const history = await transport({ method: "getPatientHistory", payload: { patient_id: "pat-1" } });
    assert.deepEqual(history.encounters, [
      { encounter_date: "2026-09-20 09:46:28", reason: "Chest pain", facility: "Dev Clinic" },
      { encounter_date: "2026-08-01 10:00:00", reason: "Review", facility: null }
    ]);
    assert.deepEqual(history.medications.map((m) => [m.medication_name, m.status]), [["Aspirin", "active"], ["Warfarin", "inactive"]]);
    assert.ok(history.as_of);
    assert.ok(requests.includes("GET /apis/default/api/patient/3/medication"));
  });
});

test("native OpenEMR patient history fails visibly, not with an empty list, when the pid cannot be resolved", async () => {
  await withServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/oauth/token") return res.end(JSON.stringify({ access_token: "opaque-test-token", token_type: "Bearer" }));
    if (req.url.endsWith("/encounter")) return res.end(JSON.stringify({ data: [] }));
    if (req.url === "/apis/default/api/patient/pat-9") return res.end(JSON.stringify({ data: {} }));
    res.writeHead(500); res.end("{}");
  }, async (port) => {
    const transport = createOpenEmrTransportFromEnv({
      OPENEMR_API_STYLE: "standard", OPENEMR_BASE_URL: `http://127.0.0.1:${port}`, OPENEMR_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
      OPENEMR_CLIENT_ID: "client", OPENEMR_CLIENT_SECRET: "secret", OPENEMR_USERNAME: "user", OPENEMR_PASSWORD: "pass", OPENEMR_USER_ROLE: "users"
    });
    await assert.rejects(() => transport({ method: "getPatientHistory", payload: { patient_id: "pat-9" } }), /did not include a pid/);
  });
});
test("native OpenEMR patient history treats OpenEMR's 404 for an empty medication list as no medications, and fails on other errors", async () => {
  for (const [status, expectFailure] of [[404, false], [500, true]]) {
    await withServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/oauth/token") return res.end(JSON.stringify({ access_token: "opaque-test-token", token_type: "Bearer" }));
      if (req.url.endsWith("/encounter")) return res.end(JSON.stringify({ data: [{ date: "2026-09-20 09:46:28", reason: "Chest pain", facility_name: null }] }));
      if (req.url === "/apis/default/api/patient/pat-1") return res.end(JSON.stringify({ data: { uuid: "pat-1", pid: 3 } }));
      res.writeHead(status); res.end(status === 404 ? "" : "{}");
    }, async (port) => {
      const transport = createOpenEmrTransportFromEnv({
        OPENEMR_API_STYLE: "standard", OPENEMR_BASE_URL: `http://127.0.0.1:${port}`, OPENEMR_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
        OPENEMR_CLIENT_ID: "client", OPENEMR_CLIENT_SECRET: "secret", OPENEMR_USERNAME: "user", OPENEMR_PASSWORD: "pass", OPENEMR_USER_ROLE: "users"
      });
      const outcome = transport({ method: "getPatientHistory", payload: { patient_id: "pat-1" } });
      if (expectFailure) return assert.rejects(() => outcome);
      const history = await outcome;
      assert.deepEqual(history.medications, []);
      assert.equal(history.encounters.length, 1);
    });
  }
});
function standardTransport(port, extra = {}) {
  return createOpenEmrTransportFromEnv({
    OPENEMR_API_STYLE: "standard", OPENEMR_BASE_URL: `http://127.0.0.1:${port}`, OPENEMR_TOKEN_URL: `http://127.0.0.1:${port}/oauth/token`,
    OPENEMR_CLIENT_ID: "client", OPENEMR_CLIENT_SECRET: "secret", OPENEMR_USERNAME: "user", OPENEMR_PASSWORD: "pass", OPENEMR_USER_ROLE: "users",
    ...extra
  });
}

test("patient and encounter creation probe OpenEMR first and send nothing when it does not answer", async () => {
  const requests = [];
  // Accepts connections but never answers, like a stopped container whose packets are dropped.
  await withServer((req) => { requests.push(`${req.method} ${req.url}`); }, async (port) => {
    const transport = standardTransport(port, { OPENEMR_PROBE_TIMEOUT_MS: "200" });
    for (const [method, payload] of [["createEncounter", { patient_id: "p1", care_started_at: "2026-09-20T10:00:00Z", presenting_complaint: "x" }], ["createPatient", { first_name: "A", last_name: "B", dob: "1990-01-01", sex: "male" }]]) {
      await assert.rejects(() => transport({ method, payload }), (error) => error.notSent === true && error.code === "DOWNSTREAM_UNAVAILABLE" && /not attempted/.test(error.message));
    }
    assert.ok(requests.every((request) => request === "GET /"), `only probes may reach the server, saw: ${requests}`);
    assert.ok(!requests.some((request) => request.startsWith("POST")), "no write, and no token request, may be sent");
  });
});

test("a refused connection is also reported as not sent", async () => {
  const { createServer: create } = await import("node:http");
  const server = create(); await new Promise((r) => server.listen(0, r)); const port = server.address().port; await new Promise((r) => server.close(r));
  const transport = standardTransport(port, { OPENEMR_PROBE_TIMEOUT_MS: "500" });
  await assert.rejects(() => transport({ method: "createEncounter", payload: { patient_id: "p1", care_started_at: "2026-09-20T10:00:00Z", presenting_complaint: "x" } }), (error) => error.notSent === true);
});

test("vitals and intervention writes are also reported as not sent when OpenEMR is unreachable", async () => {
  const { createServer: create } = await import("node:http");
  const server = create(); await new Promise((r) => server.listen(0, r)); const port = server.address().port; await new Promise((r) => server.close(r));
  const transport = standardTransport(port, { OPENEMR_PROBE_TIMEOUT_MS: "500" });
  const base = { patient_id: "p1", encounter_id: "e1" };
  await assert.rejects(() => transport({ method: "createObservation", payload: { ...base, vital_signs: { heart_rate_bpm: 80 } } }), (error) => error.notSent === true);
  await assert.rejects(() => transport({ method: "createIntervention", payload: { ...base, type: "medication", name: "Aspirin" } }), (error) => error.notSent === true);
});

test("a reachable OpenEMR is probed once and then written to, even when the probe answers with an error status", async () => {
  for (const probeStatus of [302, 500]) {
    const requests = [];
    await withServer(async (req, res) => {
      let body = ""; for await (const chunk of req) body += chunk;
      requests.push(`${req.method} ${req.url}`);
      res.setHeader("content-type", "application/json");
      if (req.url === "/") { res.writeHead(probeStatus); return res.end(); }
      if (req.url === "/oauth/token") return res.end(JSON.stringify({ access_token: "opaque-test-token" }));
      if (req.url === "/apis/default/api/patient/p1/encounter") return res.end(JSON.stringify({ data: { euuid: "enc-9" } }));
      res.writeHead(404); res.end("{}");
    }, async (port) => {
      const result = await standardTransport(port)({ method: "createEncounter", payload: { patient_id: "p1", care_started_at: "2026-09-20T10:00:00Z", presenting_complaint: "x" } });
      assert.equal(result.encounter_id, "enc-9");
      assert.deepEqual(requests, ["GET /", "POST /oauth/token", "POST /apis/default/api/patient/p1/encounter"]);
    });
  }
});