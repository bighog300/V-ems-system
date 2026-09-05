import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Literal expected instants deliberately do not use Date to calculate offsets.
const zones = {
  UTC: [
    ["2026-01-16T10:15", "2026-01-16T10:15:00.000Z"],
    ["2026-04-16T10:15", "2026-04-16T10:15:00.000Z"]
  ],
  "Europe/London": [
    ["2026-01-16T10:15", "2026-01-16T10:15:00.000Z"],
    ["2026-04-16T10:15", "2026-04-16T09:15:00.000Z"],
    ["2026-03-29T00:30", "2026-03-29T00:30:00.000Z"],
    ["2026-03-29T02:30", "2026-03-29T01:30:00.000Z"],
    ["2026-10-25T01:30", "2026-10-25T00:30:00.000Z"]
  ],
  "America/New_York": [
    ["2026-01-16T10:15", "2026-01-16T15:15:00.000Z"],
    ["2026-04-16T10:15", "2026-04-16T14:15:00.000Z"]
  ],
  "Asia/Kolkata": [["2026-04-16T00:15", "2026-04-15T18:45:00.000Z"]]
};
for (const [TZ, cases] of Object.entries(zones)) {
  test(`crew datetime-local contract in ${TZ}`, () => {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../fixtures/crew-timezone.mjs", import.meta.url)),
      JSON.stringify(cases.map(([local, utc]) => ({ local, utc })))
    ], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  });
}
