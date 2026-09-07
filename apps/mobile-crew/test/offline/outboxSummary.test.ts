import assert from "node:assert/strict";
import { test } from "node:test";

import { needsAttention, scopeLabel, statusLabel, summarizeOutboxEntries } from "../../src/offline/outboxSummary.ts";

test("summarizeOutboxEntries counts entries by status", () => {
  const summary = summarizeOutboxEntries([
    { status: "queued" },
    { status: "queued" },
    { status: "retrying" },
    { status: "failed" },
    { status: "conflict" },
    { status: "acknowledged" }
  ]);
  assert.deepEqual(summary, { queued: 2, sending: 0, retrying: 1, conflict: 1, failed: 1, acknowledged: 1 });
});

test("summarizeOutboxEntries returns all zeros for an empty list", () => {
  assert.deepEqual(summarizeOutboxEntries([]), { queued: 0, sending: 0, retrying: 0, conflict: 0, failed: 0, acknowledged: 0 });
});

test("needsAttention is true only when there's a conflict or failure", () => {
  assert.equal(needsAttention(summarizeOutboxEntries([{ status: "queued" }, { status: "retrying" }])), false);
  assert.equal(needsAttention(summarizeOutboxEntries([{ status: "failed" }])), true);
  assert.equal(needsAttention(summarizeOutboxEntries([{ status: "conflict" }])), true);
});

test("scopeLabel maps known scopes to crew-facing labels, falling back to the raw scope", () => {
  assert.equal(scopeLabel("observation"), "Vitals");
  assert.equal(scopeLabel("medication"), "Medication");
  assert.equal(scopeLabel("something_new"), "something_new");
});

test("statusLabel maps every OutboxStatus to a crew-facing label", () => {
  assert.equal(statusLabel("queued"), "Waiting to sync");
  assert.equal(statusLabel("failed"), "Failed");
  assert.equal(statusLabel("conflict"), "Conflict");
});
