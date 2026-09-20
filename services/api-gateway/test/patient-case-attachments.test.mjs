import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "vems-attachments-api-"));
  const orchestration = new OrchestrationService({
    dbPath: join(dir, "platform.sqlite"),
    objectStorageOptions: { rootDir: join(dir, "objects"), encryptionKey: "d".repeat(64) }
  });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    orchestration,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      orchestration.db.db?.close();
      rmSync(dir, { recursive: true, force: true });
    },
    async request(path, method = "GET", payload, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-user-role": "supervisor",
          "x-actor-id": "STAFF-001",
          ...(method !== "GET" ? { "idempotency-key": `${method}-${path}-${Math.random()}` } : {}),
          ...headers
        },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

async function withPatientCase(harness) {
  const incident = await harness.orchestration.createIncident(
    { call: { call_source: "phone", received_at: "2026-01-01T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "d", address: "a", patient_count: 1 } },
    { correlationId: "incident-correlation" }
  );
  const patientCase = await harness.orchestration.createPatientCase(incident.incident_id, {}, { correlationId: "case-correlation" });
  return patientCase.patient_case_id;
}

const attachmentPayload = (overrides = {}) => ({
  attachment_id: "ATT-api-1",
  kind: "photo",
  file_name: "scene.jpg",
  mime_type: "image/jpeg",
  content_base64: Buffer.from("fake jpeg bytes").toString("base64"),
  ...overrides
});

test("POST/GET attachment endpoints upload, list, and fetch content", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  const id = await withPatientCase(harness);

  const uploaded = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload());
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.attachment_id, "ATT-api-1");
  assert.equal("content_base64" in uploaded.body, false);

  const list = await harness.request(`/api/patient-cases/${id}/attachments`);
  assert.equal(list.status, 200);
  assert.equal(list.body.attachments.length, 1);
  assert.equal(list.body.attachments[0].attachment_id, "ATT-api-1");

  const content = await harness.request(`/api/patient-cases/${id}/attachments/ATT-api-1`);
  assert.equal(content.status, 200);
  assert.equal(content.body.content_base64, attachmentPayload().content_base64);
  assert.equal(content.body.mime_type, "image/jpeg");
});

test("re-uploading the same attachment id is idempotent through the API", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  const first = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload());
  const second = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload());
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.body.checksum, first.body.checksum);
});

test("upload validation errors surface as 400", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  const response = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload({ kind: "video" }));
  assert.equal(response.status, 400);
});

test("GET attachment content 404s for an unknown attachment id", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  const response = await harness.request(`/api/patient-cases/${id}/attachments/ATT-nope`);
  assert.equal(response.status, 404);
});

test("upload 404s for a nonexistent patient case", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  const response = await harness.request("/api/patient-cases/PCR-999999/attachments", "POST", attachmentPayload());
  assert.equal(response.status, 404);
});

test("RBAC: a role outside the allowed list is denied when RBAC is enforced", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  const response = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload(), { "x-user-role": "dispatcher" });
  assert.equal(response.status, 403);
});

test("attachment uploads honor their own, larger body size ceiling than other JSON endpoints", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  process.env.ATTACHMENT_BODY_MAX_BYTES = "64";
  try {
    const response = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload());
    assert.equal(response.status, 413);
    assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
  } finally {
    delete process.env.ATTACHMENT_BODY_MAX_BYTES;
  }
});

test("RBAC: clinical_reviewer can read attachments but not upload them", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());
  const id = await withPatientCase(harness);

  const uploaded = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload());
  assert.equal(uploaded.status, 201);

  const reviewerRead = await harness.request(`/api/patient-cases/${id}/attachments`, "GET", undefined, { "x-user-role": "clinical_reviewer" });
  assert.equal(reviewerRead.status, 200);

  const reviewerUpload = await harness.request(`/api/patient-cases/${id}/attachments`, "POST", attachmentPayload({ attachment_id: "ATT-api-2" }), { "x-user-role": "clinical_reviewer" });
  assert.equal(reviewerUpload.status, 403);
});
