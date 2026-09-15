import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { checkDependencies } from "../src/dependency-health.mjs";

function fakeOrchestration({ dbFails = false, objectStorageFails = false } = {}) {
  return {
    db: {
      dialect: "sqlite",
      async queryOne(sql) {
        if (dbFails) throw new Error("connection refused");
        assert.equal(sql, "SELECT 1;");
        return { 1: 1 };
      }
    },
    objectStorage: {
      async putObject(content) {
        if (objectStorageFails) throw new Error("disk full");
        return { key: "probe-key", checksum: "probe-key" };
      },
      async getObject(key) {
        assert.equal(key, "probe-key");
        return { content: Buffer.from("vems-readiness-probe") };
      }
    }
  };
}

test("checkDependencies reports healthy when database and object storage both succeed, without checking upstream by default", async () => {
  const result = await checkDependencies(fakeOrchestration(), {});
  assert.equal(result.healthy, true);
  assert.equal(result.database.ok, true);
  assert.equal(result.database.dialect, "sqlite");
  assert.equal(typeof result.database.latency_ms, "number");
  assert.equal(result.object_storage.ok, true);
  assert.equal(result.vtiger.checked, false);
  assert.equal(result.openemr.checked, false);
});

test("checkDependencies reports unhealthy when the database check fails", async () => {
  const result = await checkDependencies(fakeOrchestration({ dbFails: true }), {});
  assert.equal(result.healthy, false);
  assert.equal(result.database.ok, false);
  assert.match(result.database.error, /connection refused/);
  // Object storage is still checked and reported independently.
  assert.equal(result.object_storage.ok, true);
});

test("checkDependencies reports unhealthy when the object storage round-trip fails", async () => {
  const result = await checkDependencies(fakeOrchestration({ objectStorageFails: true }), {});
  assert.equal(result.healthy, false);
  assert.equal(result.object_storage.ok, false);
  assert.match(result.object_storage.error, /disk full/);
});

test("checkDependencies skips Vtiger/OpenEMR reachability when connectivity checks are disabled", async () => {
  const result = await checkDependencies(fakeOrchestration(), {
    UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "false",
    VTIGER_BASE_URL: "http://127.0.0.1:1",
    OPENEMR_BASE_URL: "http://127.0.0.1:1"
  });
  assert.equal(result.vtiger.checked, false);
  assert.equal(result.openemr.checked, false);
  assert.equal(result.healthy, true);
});

test("checkDependencies pings Vtiger/OpenEMR when connectivity checks are enabled and reports success", async () => {
  const server = createServer((req, res) => { res.writeHead(200); res.end("ok"); });
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await checkDependencies(fakeOrchestration(), {
      UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "true",
      VTIGER_BASE_URL: baseUrl,
      OPENEMR_BASE_URL: baseUrl
    });
    assert.equal(result.vtiger.checked, true);
    assert.equal(result.vtiger.ok, true);
    assert.equal(result.vtiger.status, 200);
    assert.equal(result.openemr.checked, true);
    assert.equal(result.openemr.ok, true);
    assert.equal(result.healthy, true);
  } finally {
    server.close();
  }
});

test("checkDependencies reports unhealthy when an enabled upstream check can't reach its target", async () => {
  const server = createServer((req, res) => { res.writeHead(200); res.end("ok"); });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve)); // now guaranteed unreachable on this port

  const result = await checkDependencies(fakeOrchestration(), {
    UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "true",
    VTIGER_BASE_URL: `http://127.0.0.1:${port}`
  });
  assert.equal(result.vtiger.checked, true);
  assert.equal(result.vtiger.ok, false);
  assert.ok(result.vtiger.error);
  assert.equal(result.healthy, false);
});

test("checkDependencies respects VALIDATION_TIMEOUT_MS for an unresponsive upstream", async () => {
  // A TCP listener that never responds -- the connection succeeds but the
  // request itself hangs, so this exercises the abort-on-timeout path
  // rather than a connection-refused error.
  const server = createServer(() => {}); // never calls res.end()
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const startedAt = Date.now();
    const result = await checkDependencies(fakeOrchestration(), {
      UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "true",
      VTIGER_BASE_URL: baseUrl,
      VALIDATION_TIMEOUT_MS: "100"
    });
    assert.equal(result.vtiger.checked, true);
    assert.equal(result.vtiger.ok, false);
    assert.match(result.vtiger.error, /Timed out after 100ms/);
    assert.ok(Date.now() - startedAt < 2000, "should abort near the configured timeout, not hang");
    assert.equal(result.healthy, false);
  } finally {
    server.close();
  }
});
