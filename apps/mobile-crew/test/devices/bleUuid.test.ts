import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeUuid, uuidsMatch } from "../../src/devices/bleUuid.ts";

test("normalizeUuid expands a 16-bit short-form UUID to canonical 128-bit form", () => {
  assert.equal(normalizeUuid("180d"), "0000180d-0000-1000-8000-00805f9b34fb");
});

test("normalizeUuid is case-insensitive", () => {
  assert.equal(normalizeUuid("180D"), "0000180d-0000-1000-8000-00805f9b34fb");
});

test("normalizeUuid expands a 32-bit short-form UUID to canonical 128-bit form", () => {
  assert.equal(normalizeUuid("0000180d"), "0000180d-0000-1000-8000-00805f9b34fb");
});

test("normalizeUuid leaves an already-full 128-bit UUID as-is (lowercased)", () => {
  assert.equal(normalizeUuid("0000180D-0000-1000-8000-00805F9B34FB"), "0000180d-0000-1000-8000-00805f9b34fb");
});

test("uuidsMatch compares two UUIDs regardless of form", () => {
  assert.ok(uuidsMatch("180d", "0000180d-0000-1000-8000-00805f9b34fb"));
  assert.ok(!uuidsMatch("180d", "1810"));
});
