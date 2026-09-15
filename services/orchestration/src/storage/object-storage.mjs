import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function resolveEncryptionKey(options) {
  const configured = options.encryptionKey ?? process.env.VEMS_OBJECT_STORAGE_KEY;
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("VEMS_OBJECT_STORAGE_KEY must decode to exactly 32 bytes (64 hex characters, or base64)");
    return key;
  }
  // Deterministic, publicly-known, INSECURE fallback key so local/test runs
  // (and any deployment that hasn't configured one yet) work with zero
  // setup -- never used once VEMS_OBJECT_STORAGE_KEY is set. Refusing to
  // start in production with an insecure default is a cross-cutting
  // concern (JWT secret, DB credentials, this key) that belongs to Stage 12
  // milestone 12f's centralized startup check, not scattered per-module.
  return createHash("sha256").update("vems-object-storage-dev-key-insecure").digest();
}

function checksumOf(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function objectPathFor(rootDir, checksum) {
  return join(rootDir, "objects", checksum.slice(0, 2), checksum.slice(2, 4), checksum);
}

/**
 * Encrypted, content-addressed object storage backed by the local
 * filesystem -- Stage 12's design decision to build the encrypted
 * object-storage *interface* now, with a filesystem-backed implementation
 * behind it, rather than adding an S3-compatible dependency this stage.
 * A real S3-compatible backend becomes a drop-in second implementation of
 * this same putObject/getObject/deleteObject/pruneExpired surface later.
 *
 * A stored object's key is the sha256 checksum of its plaintext content,
 * so identical content -- even from different callers -- is automatically
 * deduplicated on disk, and every read is independently tamper-evident:
 * getObject re-derives the checksum from the decrypted plaintext and
 * rejects anything that doesn't match the key it was fetched by.
 */
export class FilesystemObjectStorage {
  constructor(options = {}) {
    this.rootDir = options.rootDir ?? process.env.VEMS_OBJECT_STORAGE_DIR ?? ".data/object-storage";
    const retentionDays = options.retentionDays ?? process.env.VEMS_OBJECT_STORAGE_RETENTION_DAYS;
    this.retentionDays = retentionDays ? Number(retentionDays) : null;
    this.encryptionKey = resolveEncryptionKey(options);
    mkdirSync(join(this.rootDir, "objects"), { recursive: true });
  }

  async putObject(content, { contentType = "application/octet-stream" } = {}) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const checksum = checksumOf(buffer);
    const objectPath = objectPathFor(this.rootDir, checksum);
    const metaPath = `${objectPath}.meta.json`;

    if (!existsSync(objectPath)) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
      const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
      const authTag = cipher.getAuthTag();
      mkdirSync(dirname(objectPath), { recursive: true });
      writeFileSync(objectPath, Buffer.concat([iv, authTag, ciphertext]));
      writeFileSync(metaPath, JSON.stringify({ checksum, contentType, sizeBytes: buffer.length, createdAt: new Date().toISOString() }));
    }

    return { key: checksum, checksum, sizeBytes: buffer.length, contentType };
  }

  async getObject(key) {
    const objectPath = objectPathFor(this.rootDir, key);
    const metaPath = `${objectPath}.meta.json`;
    if (!existsSync(objectPath) || !existsSync(metaPath)) return null;

    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const raw = readFileSync(objectPath);
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const actualChecksum = checksumOf(plaintext);
    if (actualChecksum !== key || actualChecksum !== meta.checksum) {
      throw new Error(`Object storage integrity check failed for key ${key}`);
    }

    return { content: plaintext, contentType: meta.contentType, sizeBytes: meta.sizeBytes, checksum: meta.checksum, createdAt: meta.createdAt };
  }

  async deleteObject(key) {
    const objectPath = objectPathFor(this.rootDir, key);
    const metaPath = `${objectPath}.meta.json`;
    for (const path of [objectPath, metaPath]) if (existsSync(path)) unlinkSync(path);
  }

  /**
   * Deletes every object whose createdAt is older than retentionDays.
   * A no-op unless retentionDays is explicitly configured: clinical
   * attachments must never expire silently by default, so a deployment
   * has to opt into automatic pruning deliberately.
   */
  async pruneExpired(now = new Date()) {
    if (!this.retentionDays) return { prunedCount: 0 };
    const cutoff = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000;
    let prunedCount = 0;
    const objectsDir = join(this.rootDir, "objects");
    if (!existsSync(objectsDir)) return { prunedCount };

    for (const shard1 of readdirSync(objectsDir)) {
      const shard1Path = join(objectsDir, shard1);
      if (!statSync(shard1Path).isDirectory()) continue;
      for (const shard2 of readdirSync(shard1Path)) {
        const shard2Path = join(shard1Path, shard2);
        if (!statSync(shard2Path).isDirectory()) continue;
        for (const name of readdirSync(shard2Path)) {
          if (!name.endsWith(".meta.json")) continue;
          const meta = JSON.parse(readFileSync(join(shard2Path, name), "utf8"));
          if (new Date(meta.createdAt).getTime() < cutoff) {
            await this.deleteObject(name.replace(/\.meta\.json$/, ""));
            prunedCount += 1;
          }
        }
      }
    }
    return { prunedCount };
  }
}
