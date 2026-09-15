import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";
import { PostgresClient } from "../src/postgres-client.mjs";

const execFileAsync = promisify(execFile);
const POSTGRES_URL = process.env.VEMS_TEST_POSTGRES_URL;
const maybeTest = POSTGRES_URL ? test : test.skip;
const SCRIPT = new URL("../../../scripts/migrate-sqlite-to-postgres.mjs", import.meta.url).pathname;

maybeTest("migrates a seeded SQLite deployment into an empty Postgres database, sequences included", async (t) => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "vems-migrate-")), "platform.sqlite");
  const source = new OrchestrationService({ dbPath });
  const incident = await source.createIncident(
    { call: { call_source: "phone", received_at: "2026-01-01T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "d", address: "a", patient_count: 1 } },
    { correlationId: "corr-1" }
  );
  await source.createPatientCase(incident.incident_id, {}, { correlationId: "corr-2" });

  await execFileAsync(process.execPath, [SCRIPT, dbPath, POSTGRES_URL]);

  const target = createTargetService();
  t.after(() => target.db.close());

  const migratedIncident = await target.getIncident(incident.incident_id);
  assert.equal(migratedIncident.incident_id, incident.incident_id);
  const cases = await target.listPatientCases(incident.incident_id);
  assert.equal(cases.length, 1);

  // The SERIAL-backed audit_logs/sync_intents sequences must be resynced
  // past the migrated rows' explicit ids, or the very next write collides.
  const nextIncident = await target.createIncident(
    { call: { call_source: "phone", received_at: "2026-01-01T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "d2", address: "a2", patient_count: 1 } },
    { correlationId: "corr-3" }
  );
  assert.notEqual(nextIncident.incident_id, incident.incident_id);

  function createTargetService() {
    return new OrchestrationService({ db: new PostgresClient({ connectionString: POSTGRES_URL }) });
  }
});
