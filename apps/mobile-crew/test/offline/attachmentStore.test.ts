import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { migrate } from "../../src/offline/db.ts";
import { enqueueAttachment, getAttachmentContent, listAttachments } from "../../src/offline/attachmentStore.ts";
import { createNodeSqliteAdapter } from "./nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return {
    randomUUID: () => randomUUID(),
    getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count))
  };
}

async function setupDb() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return db;
}

test("enqueueAttachment returns an id, and getAttachmentContent decrypts the original base64 content back", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const base64Content = Buffer.from("not a real jpeg, just test bytes").toString("base64");

  const attachmentId = await enqueueAttachment(
    db,
    key,
    { patientCaseId: "case-1", kind: "photo", fileName: "scene.jpg", mimeType: "image/jpeg", sizeBytes: 33, base64Content },
    { cryptoModule: fakeCryptoModule() }
  );

  assert.equal(typeof attachmentId, "string");
  const content = await getAttachmentContent(db, key, attachmentId);
  assert.equal(content, base64Content);
});

test("listAttachments returns metadata only — never the encrypted content or the decrypted base64", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  await enqueueAttachment(
    db,
    key,
    { patientCaseId: "case-1", kind: "photo", fileName: "scene.jpg", mimeType: "image/jpeg", sizeBytes: 100, base64Content: "c2VjcmV0LWNvbnRlbnQ=" },
    { cryptoModule }
  );

  const list = await listAttachments(db, "case-1");
  assert.equal(list.length, 1);
  assert.equal(list[0].fileName, "scene.jpg");
  assert.equal(list[0].kind, "photo");
  assert.equal(list[0].status, "queued");
  assert.equal((list[0] as unknown as Record<string, unknown>).base64Content, undefined);
  assert.equal(JSON.stringify(list).includes("c2VjcmV0"), false);
});

test("listAttachments only returns attachments for the requested patient case", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  await enqueueAttachment(db, key, { patientCaseId: "case-1", kind: "photo", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1, base64Content: "AA==" }, { cryptoModule });
  await enqueueAttachment(db, key, { patientCaseId: "case-2", kind: "document", fileName: "b.pdf", mimeType: "application/pdf", sizeBytes: 1, base64Content: "AA==" }, { cryptoModule });

  const list = await listAttachments(db, "case-1");
  assert.equal(list.length, 1);
  assert.equal(list[0].fileName, "a.jpg");
});

test("getAttachmentContent returns null for an unknown attachmentId", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  assert.equal(await getAttachmentContent(db, key, "missing"), null);
});

test("an attachment encrypted under one device key cannot be decrypted with another", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const otherKey = new Uint8Array(randomBytes(32));
  const attachmentId = await enqueueAttachment(
    db,
    key,
    { patientCaseId: "case-1", kind: "photo", fileName: "scene.jpg", mimeType: "image/jpeg", sizeBytes: 1, base64Content: "AA==" },
    { cryptoModule: fakeCryptoModule() }
  );
  await assert.rejects(async () => getAttachmentContent(db, otherKey, attachmentId));
});
