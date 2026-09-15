import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FilesystemObjectStorage } from "../src/storage/object-storage.mjs";

function storage(options = {}) {
  return new FilesystemObjectStorage({
    rootDir: mkdtempSync(join(tmpdir(), "vems-object-storage-")),
    encryptionKey: "a".repeat(64),
    ...options
  });
}

test("putObject is content-addressed and getObject round-trips the original bytes", async () => {
  const s = storage();
  const put = await s.putObject(Buffer.from("hello world"), { contentType: "text/plain" });
  assert.equal(put.key, put.checksum);
  assert.equal(put.sizeBytes, 11);

  const got = await s.getObject(put.key);
  assert.equal(got.content.toString(), "hello world");
  assert.equal(got.contentType, "text/plain");
  assert.equal(got.sizeBytes, 11);
  assert.equal(got.checksum, put.checksum);
});

test("identical content dedupes to the same key without rewriting", async () => {
  const s = storage();
  const first = await s.putObject(Buffer.from("same bytes"), { contentType: "text/plain" });
  const second = await s.putObject(Buffer.from("same bytes"), { contentType: "text/plain" });
  assert.equal(first.key, second.key);
});

test("different content produces different keys", async () => {
  const s = storage();
  const a = await s.putObject(Buffer.from("content a"));
  const b = await s.putObject(Buffer.from("content b"));
  assert.notEqual(a.key, b.key);
});

test("getObject returns null for a key that was never stored", async () => {
  const s = storage();
  assert.equal(await s.getObject("0".repeat(64)), null);
});

test("content at rest is actually encrypted, not plaintext", async () => {
  const s = storage();
  const put = await s.putObject(Buffer.from("sensitive clinical content"), { contentType: "text/plain" });
  const rootDir = s.rootDir;
  const objectPath = join(rootDir, "objects", put.key.slice(0, 2), put.key.slice(2, 4), put.key);
  const raw = readFileSync(objectPath);
  assert.ok(!raw.includes("sensitive clinical content"));
});

test("a different encryption key cannot decrypt another store's objects", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "vems-object-storage-"));
  const writer = new FilesystemObjectStorage({ rootDir, encryptionKey: "a".repeat(64) });
  const put = await writer.putObject(Buffer.from("secret"));

  const reader = new FilesystemObjectStorage({ rootDir, encryptionKey: "b".repeat(64) });
  await assert.rejects(() => reader.getObject(put.key));
});

test("tampering with stored ciphertext is detected on read", async () => {
  const s = storage();
  const put = await s.putObject(Buffer.from("tamper me"));
  const objectPath = join(s.rootDir, "objects", put.key.slice(0, 2), put.key.slice(2, 4), put.key);
  const raw = readFileSync(objectPath);
  raw[raw.length - 1] ^= 0xff;
  writeFileSync(objectPath, raw);
  await assert.rejects(() => s.getObject(put.key));
});

test("deleteObject removes both the object and its metadata", async () => {
  const s = storage();
  const put = await s.putObject(Buffer.from("delete me"));
  assert.ok(await s.getObject(put.key));
  await s.deleteObject(put.key);
  assert.equal(await s.getObject(put.key), null);
});

test("pruneExpired is a no-op unless retentionDays is configured", async () => {
  const s = storage();
  const put = await s.putObject(Buffer.from("keep forever"));
  const result = await s.pruneExpired(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  assert.equal(result.prunedCount, 0);
  assert.ok(await s.getObject(put.key));
});

test("pruneExpired deletes objects older than the configured retention window", async () => {
  const s = storage({ retentionDays: 30 });
  const put = await s.putObject(Buffer.from("old content"));

  // Not yet expired.
  let result = await s.pruneExpired(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
  assert.equal(result.prunedCount, 0);
  assert.ok(await s.getObject(put.key));

  // Past the retention window.
  result = await s.pruneExpired(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
  assert.equal(result.prunedCount, 1);
  assert.equal(await s.getObject(put.key), null);
});

test("rejects a misconfigured encryption key that doesn't decode to 32 bytes", () => {
  assert.throws(() => storage({ encryptionKey: "too-short" }), /32 bytes/);
});

test("falls back to a deterministic dev key when none is configured, without throwing", () => {
  const previous = process.env.VEMS_OBJECT_STORAGE_KEY;
  delete process.env.VEMS_OBJECT_STORAGE_KEY;
  try {
    const s = new FilesystemObjectStorage({ rootDir: mkdtempSync(join(tmpdir(), "vems-object-storage-")) });
    assert.equal(s.encryptionKey.length, 32);
  } finally {
    if (previous !== undefined) process.env.VEMS_OBJECT_STORAGE_KEY = previous;
  }
});

test("refuses to start in production without a real encryption key", () => {
  const previousEnv = process.env.APP_ENV;
  const previousKey = process.env.VEMS_OBJECT_STORAGE_KEY;
  process.env.APP_ENV = "production";
  delete process.env.VEMS_OBJECT_STORAGE_KEY;
  try {
    assert.throws(
      () => new FilesystemObjectStorage({ rootDir: mkdtempSync(join(tmpdir(), "vems-object-storage-")) }),
      /VEMS_OBJECT_STORAGE_KEY is required in production/
    );
    assert.throws(
      () => new FilesystemObjectStorage({ rootDir: mkdtempSync(join(tmpdir(), "vems-object-storage-")), encryptionKey: "changeme" }),
      /VEMS_OBJECT_STORAGE_KEY is required in production/
    );
  } finally {
    if (previousEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousEnv;
    if (previousKey !== undefined) process.env.VEMS_OBJECT_STORAGE_KEY = previousKey;
  }
});
