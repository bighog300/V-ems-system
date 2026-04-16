import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  runConfiguredConnectivityValidation,
  validateOpenEmrConnectivity,
  validateVtigerConnectivity
} from "../../../scripts/connectivity-lib.mjs";

async function withServer(routes, run) {
  const server = createServer((req, res) => {
    const handler = routes[`${req.method} ${req.url}`] ?? routes[req.url] ?? routes.default;
    if (!handler) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    handler(req, res);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("vtiger connectivity validates ping and challenge when auth checks are enabled", async () => {
  await withServer({
    "GET /": (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    default: (req, res) => {
      if (req.url.startsWith("/webservice.php?operation=getchallenge")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, result: { token: "challenge-token" } }));
        return;
      }
      res.writeHead(404).end();
    }
  }, async (baseUrl) => {
    const result = await validateVtigerConnectivity({
      VTIGER_BASE_URL: baseUrl,
      VTIGER_USERNAME: "integration-user",
      VTIGER_CONNECTIVITY_CHECK_AUTH: "true"
    }, { logger: { info() {} } });

    assert.equal(result.target, "vtiger");
    assert.equal(result.ping.ok, true);
    assert.equal(result.auth.checked, true);
    assert.equal(result.auth.ok, true);
  });
});

test("openemr connectivity fails with actionable message when token endpoint rejects credentials", async () => {
  await withServer({
    "GET /": (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    "POST /oauth/token": (_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_client" }));
    }
  }, async (baseUrl) => {
    await assert.rejects(() => validateOpenEmrConnectivity({
      OPENEMR_BASE_URL: baseUrl,
      OPENEMR_CONNECTIVITY_CHECK_AUTH: "true",
      OPENEMR_TOKEN_URL: `${baseUrl}/oauth/token`,
      OPENEMR_CLIENT_ID: "bad-client",
      OPENEMR_CLIENT_SECRET: "bad-secret"
    }, { logger: { info() {} } }), /token request failed with status 401/);
  });
});

test("configured validation skips cleanly when env flags are disabled", async () => {
  const summary = await runConfiguredConnectivityValidation({
    SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY: "false",
    UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "false"
  }, { logger: { info() {} } });

  assert.equal(summary.skipped, true);
  assert.deepEqual(summary.results, []);
});
