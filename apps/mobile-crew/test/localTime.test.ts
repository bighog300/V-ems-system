import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLocalDateTime } from "../src/format/localTime.ts";

test("shows an ISO instant in the given time zone, with the zone named", () => {
  const london = formatLocalDateTime("2026-09-20T09:05:00.000Z", { timeZone: "Europe/London", locale: "en-GB" });
  assert.match(london, /10:05/);
  assert.match(london, /BST|GMT\+1/);
  assert.doesNotMatch(london, /T09:05|Z$/);
  assert.match(formatLocalDateTime("2026-09-20T09:05:00.000Z", { timeZone: "Asia/Kolkata", locale: "en-GB" }), /14:35/);
  assert.match(formatLocalDateTime("2026-01-20T09:05:00.000Z", { timeZone: "Europe/London", locale: "en-GB" }), /09:05/);
});

test("the same instant reads differently in different zones, so a zone name is always shown", () => {
  const auckland = formatLocalDateTime("2026-09-20T09:05:00.000Z", { timeZone: "Pacific/Auckland", locale: "en-GB" });
  const london = formatLocalDateTime("2026-09-20T09:05:00.000Z", { timeZone: "Europe/London", locale: "en-GB" });
  assert.notEqual(auckland, london);
  assert.match(auckland, /21:05/);
  assert.match(auckland, /NZ|GMT\+12/);
});

test("empty input is empty, and anything that is not a valid instant is returned unchanged rather than hidden", () => {
  assert.equal(formatLocalDateTime(null), "");
  assert.equal(formatLocalDateTime(undefined), "");
  assert.equal(formatLocalDateTime(""), "");
  assert.equal(formatLocalDateTime("not a date"), "not a date");
  assert.equal(formatLocalDateTime("2026-09-20T09:05:00.000Z", { timeZone: "Not/AZone" }), "2026-09-20T09:05:00.000Z");
});
