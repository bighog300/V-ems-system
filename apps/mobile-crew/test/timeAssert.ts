import assert from "node:assert/strict";

/**
 * Removes the charting-time field from a request body after checking that the app sent it, that it is an
 * ISO-8601 instant, and that it was captured just now (not left for the server to stamp on receipt).
 */
export function withoutChartingTime(body: unknown, field: string): Record<string, unknown> {
  const { [field]: value, ...rest } = body as Record<string, unknown>;
  assert.equal(typeof value, "string", `${field} must be sent so an offline replay keeps the charting time`);
  const instant = Date.parse(value as string);
  assert.equal(new Date(instant).toISOString(), value, `${field} must be an ISO-8601 instant`);
  assert.ok(instant <= Date.now() && instant >= Date.now() - 60_000, `${field} must be captured at submit time`);
  return rest;
}