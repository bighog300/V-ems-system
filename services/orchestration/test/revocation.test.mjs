import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() {
  return new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-revocation-")), "platform.sqlite") });
}

const meta = { correlationId: "revoke-correlation", actorId: "STAFF-999" };

test("isAccessRevoked returns false when nothing is revoked", async () => {
  const o = service();
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-001", deviceId: "device-1" }), false);
});

test("revoking a device blocks that device but not other devices or the actor generally", async () => {
  const o = service();
  const record = await o.revokeAccess({ scope: "device", target: "device-1", reason: "lost phone" }, meta);
  assert.equal(record.scope, "device");
  assert.equal(record.target, "device-1");
  assert.equal(record.reason, "lost phone");
  assert.equal(record.revoked_by, "STAFF-999");
  assert.match(record.revocation_id, /^REV-/);

  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-001", deviceId: "device-1" }), true);
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-001", deviceId: "device-2" }), false);
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-001" }), false);
});

test("revoking an actor blocks every device for that actor", async () => {
  const o = service();
  await o.revokeAccess({ scope: "actor", target: "STAFF-002" }, meta);
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-002", deviceId: "any-device" }), true);
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-002" }), true);
  assert.equal(await o.isAccessRevoked({ actorId: "STAFF-003", deviceId: "any-device" }), false);
});

test("re-revoking the same target updates the record in place rather than duplicating it", async () => {
  const o = service();
  await o.revokeAccess({ scope: "device", target: "device-1", reason: "first" }, meta);
  const updated = await o.revokeAccess({ scope: "device", target: "device-1", reason: "second" }, { ...meta, actorId: "STAFF-888" });
  assert.equal(updated.reason, "second");
  assert.equal(updated.revoked_by, "STAFF-888");
  const list = await o.listRevocations();
  assert.equal(list.length, 1);
});

test("listRevocations returns every revocation, newest first", async () => {
  const o = service();
  await o.revokeAccess({ scope: "device", target: "device-1" }, meta);
  await o.revokeAccess({ scope: "actor", target: "STAFF-002" }, meta);
  const list = await o.listRevocations();
  assert.equal(list.length, 2);
  assert.deepEqual(new Set(list.map((r) => r.target)), new Set(["device-1", "STAFF-002"]));
});

test("revokeAccess validates scope, target, and unknown fields", async () => {
  const o = service();
  await assert.rejects(() => o.revokeAccess({ scope: "bogus", target: "x" }, meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.revokeAccess({ scope: "device", target: "" }, meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.revokeAccess({ scope: "device" }, meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.revokeAccess({ scope: "device", target: "d1", extra: "nope" }, meta), (e) => e.code === "INVALID_PAYLOAD");
});
