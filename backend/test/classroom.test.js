import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = '';
const { getOrSetCache, invalidateCache } = await import('../src/utils/cacheHelper.js');
const { roomEvent } = await import('../src/utils/classroomEvents.js');
const { pollView } = await import('../src/utils/pollService.js');

test('a read already in flight cannot repopulate an invalidated cache', async () => {
  const key = 'classroom-cache-race';
  let finish;
  const pending = getOrSetCache(key, 60, () => new Promise(resolve => { finish = resolve; }));
  await invalidateCache(key);
  finish({ version: 1 });
  await pending;
  const fresh = await getOrSetCache(key, 60, async () => ({ version: 2 }));
  assert.equal(fresh.version, 2);
  await invalidateCache(key);
});

test('lifecycle notifications target the classroom and private workspace audience', () => {
  const emitted = [];
  const io = { to(room) {
    const rooms = [room];
    return { to(extra) { rooms.push(extra); return this; }, emit(event, payload) { emitted.push({ rooms, event, payload }); } };
  } };
  roomEvent(io, { id: 1, session_code: 'ABC123', teacher_id: 7, course_id: 3 }, 'session-ended', { sessionCode: 'ABC123' });
  assert.deepEqual(emitted[0].rooms, ['ABC123']);
  assert.equal(emitted[0].event, 'session-ended');
  assert.deepEqual(emitted[1].rooms, ['user:7', 'course:3']);
  assert.equal(emitted[1].event, 'workspace-updated');
});

test('poll snapshots preserve option order and expose only the requesting voter’s choice', () => {
  const poll = { id: 1, question: 'Example?', is_active: true, options: [{ id: 2, index: 1, text: 'B', votes: 2 }, { id: 1, index: 0, text: 'A', votes: 3 }], votes: [{ voter_key: 'user_9', option_id: 2 }] };
  const own = pollView(poll, 9);
  assert.equal(own.myVote, 1);
  assert.equal(own.totalVotes, 5);
  assert.deepEqual(own.options.map(o => o.text), ['A', 'B']);
  assert.equal('votes' in own, false);
  assert.equal('myVote' in pollView(poll), false);
});
