import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readResource, peekResource, invalidateResources } from '../src/utils/resourceCache.mjs';

test('overlapping reads share one request; account and role keys never share results', async () => {
  invalidateResources();
  let calls = 0, resolve;
  const load = () => { calls++; return new Promise(done => { resolve = done; }); };
  const a = readResource('dashboard:alice:teacher', load);
  const b = readResource('dashboard:alice:teacher', load);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve({ private: 'alice' });
  assert.deepEqual(await a, await b);
  assert.equal(peekResource('dashboard:bob:teacher'), null);
  assert.equal(peekResource('dashboard:alice:student'), null);
});

test('a request started before mutation cannot refill an invalidated snapshot', async () => {
  invalidateResources();
  let finish;
  const old = readResource('course:alice:4', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  invalidateResources();
  const current = await readResource('course:alice:4', async () => ({ version: 2 }));
  finish({ version: 1 });
  await old;
  assert.equal(current.version, 2);
  assert.equal(peekResource('course:alice:4').version, 2);
});

test('failed requests are retryable; fresh reads do not return an old snapshot', async () => {
  invalidateResources();
  await assert.rejects(readResource('fixture', async () => { throw new Error('offline'); }));
  assert.equal(peekResource('fixture'), null);
  assert.equal(await readResource('fixture', async () => 1), 1);
  assert.equal(await readResource('fixture', async () => 2, { fresh: true }), 2);
  await readResource('expired', async () => 1, { ttl: -1 });
  assert.equal(peekResource('expired'), null);
});
