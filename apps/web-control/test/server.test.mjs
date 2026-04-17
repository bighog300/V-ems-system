import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test("serves index for /", async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /<!doctype html>/i);
  } finally {
    server.close();
  }
});

test("rejects path traversal attempts", async () => {
  const { server, base } = await startServer();
  try {
    const plainTraversal = await fetch(`${base}/../package.json`);
    assert.equal(plainTraversal.status, 404);

    const encodedTraversal = await fetch(`${base}/%2e%2e/%2e%2e/package.json`);
    assert.equal(encodedTraversal.status, 404);
  } finally {
    server.close();
  }
});
