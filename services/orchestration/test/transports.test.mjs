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
