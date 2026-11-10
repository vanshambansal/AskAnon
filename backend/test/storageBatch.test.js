import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.REDIS_URL = '';
const { queueAssets } = await import('../src/utils/storageLifecycle.js');

test('batch cleanup deduplicates identities while preserving image/raw distinctions and due times', async () => {
  const calls = [];
  const db = { storageCleanup: {
    createMany: async args => calls.push(['create', args]),
    updateMany: async args => calls.push(['update', args])
  } };
  await queueAssets([{ public_id: 'shared', file_type: 'pdf' }, { public_id: 'shared', resource_type: 'raw' }, { public_id: 'shared' }, { public_id: 'another' }, {}], 0, db);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].data.length, 3);
  assert.equal(calls[0][1].skipDuplicates, true);
  assert.deepEqual(calls[1][1].where.OR, [
    { public_id: 'shared', resource_type: 'raw' }, { public_id: 'shared', resource_type: 'image' }, { public_id: 'another', resource_type: 'image' }
  ]);
  assert.equal(calls[0][1].data[0].not_before, calls[1][1].data.not_before);
});
