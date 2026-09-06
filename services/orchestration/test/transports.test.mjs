import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createOpenEmrTransportFromEnv, createVtigerTransportFromEnv } from "../src/adapters/transports.mjs";

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
