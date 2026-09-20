import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { SqliteClient } from '../src/db.mjs';

test('the client waits for a lock held by another connection instead of failing at once', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-busy-'));
  const file = join(dir, 'db.sqlite');
  const client = new SqliteClient(file);
  t.after(() => { client.db.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(client.db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  await client.execute('CREATE TABLE IF NOT EXISTS busy_probe (id INTEGER);');

  // A second process holds the write lock for a moment, as a seed script or an ops task would.
  const holder = spawn(process.execPath, ['--no-warnings', '-e', `
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(process.argv[1]); d.exec('BEGIN IMMEDIATE;'); console.log('locked');
    setTimeout(() => { d.exec('COMMIT;'); d.close(); }, 500);`, file], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => holder.stdout.once('data', resolve));
  const started = Date.now();
  await client.execute('INSERT INTO busy_probe (id) VALUES (1);');
  assert.ok(Date.now() - started >= 300, 'the write waited for the lock');
  assert.equal((await client.queryOne('SELECT count(*) AS n FROM busy_probe;')).n, 1);
});
