import test from 'node:test';
import assert from 'node:assert/strict';
import { createVtigerWebserviceClient } from '../src/adapters/vtiger/client.mjs';
import { VtigerAuth } from '../src/adapters/vtiger/auth.mjs';

test('worker uses explicit authenticated operation for create and update, with no fallback', async () => {
  const client = createVtigerWebserviceClient({ VTIGER_MIRROR_WRITE_KEY: 'k'.repeat(40) }, { mirrorWrites: true });
  const calls = [];
  client.auth.call = async (...args) => { calls.push(args); return { id: '1x2' }; };
  for (const mode of ['create', 'update']) {
    await client[mode]({ id: '1x2', vems_callsign: 'synthetic' }, 'VEMSVehicles');
    assert.deepEqual(calls.at(-1), ['vemsMirrorWrite', { elementType: 'VEMSVehicles', element: JSON.stringify({ id: '1x2', vems_callsign: 'synthetic' }), mode, writeKey: 'k'.repeat(40) }, 'POST']);
  }
  client.auth.call = async () => { throw new Error('denied'); };
  await assert.rejects(client.update({}, 'VEMSVehicles'), /denied/);
  const missing = createVtigerWebserviceClient({}, { mirrorWrites: true });
  missing.auth.call = () => assert.fail('Missing secret must not send a write');
  await assert.rejects(missing.create({}), { code: 'VTIGER_AUTH_FAILED' });
});

test('ordinary client keeps ordinary write path for negative probes', async () => {
  const client = createVtigerWebserviceClient({});
  client.auth.call = async operation => operation;
  assert.equal(await client.update({}), 'update');
});

test('uncertain custom creates retain reconciliation semantics', async () => {
  const auth = new VtigerAuth({ baseUrl: 'http://example.invalid', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<invalid>' }) });
  await assert.rejects(auth.request('vemsMirrorWrite', { mode: 'create' }, 'POST'), error => error.outcomeUnknown === true);
});
