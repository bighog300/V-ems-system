import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../src/index.mjs';

const meta = { correlationId: 'mirror-test' };

test('a personnel row inserted outside createPersonnel gets its Vtiger mirror queued exactly once', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-personnel-mirror-'));
  const s = new OrchestrationService({ dbPath: join(dir, 'db.sqlite') });
  t.after(() => { s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  await s.db.execute(`INSERT INTO personnel (staff_id, display_name, role, operational_status, home_station, created_at, updated_at, correlation_id) VALUES ('STAFF-9', 'Seeded Crew', 'field_crew', 'Available', 'Dev', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'seed');`);
  assert.equal(await s.personnelVtigerLinks.findByStaffId('STAFF-9'), undefined);

  assert.deepEqual(await s.ensurePersonnelMirror('STAFF-9', meta), { queued: true });
  assert.deepEqual(await s.ensurePersonnelMirror('STAFF-9', meta), { queued: false });

  const intents = (await s.listSyncIntents()).filter((i) => i.operation === 'createPersonnelMirror');
  assert.equal(intents.length, 1);
  assert.equal(intents[0].payload.vems_staff_id, 'STAFF-9');
  assert.equal((await s.personnelVtigerLinks.findByStaffId('STAFF-9')).sync_status, 'pending');
  await assert.rejects(() => s.ensurePersonnelMirror('STAFF-404', meta), /not found/);
});
