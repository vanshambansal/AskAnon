import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_URL = '';
const { default: prisma } = await import('../src/config/prisma.js');
const { SESSION_LIFETIME_MS, isSessionExpired, finishSession, expireDueSessions, configureSessionExpiry } = await import('../src/utils/sessionExpiry.js');
const { sessionAccess } = await import('../src/middleware/accessMiddleware.js');
const { createQuestion, upvoteQuestion } = await import('../src/controllers/questionController.js');
const { mutatePoll } = await import('../src/utils/pollService.js');
const now = new Date('2026-11-16T12:00:00Z');
const teacher = { id: 71, role: 'teacher' };
const lecture = (changes = {}) => ({ id: 91, teacher_id: 71, course_id: null, session_code: 'EXP123', title: 'CPU', is_active: true, is_paused: true, deletion_job_id: null, started_at: new Date(now - SESSION_LIFETIME_MS), ended_at: null, ...changes });

beforeEach(() => configureSessionExpiry(undefined));

function mockMethod(t, object, key, implementation) {
  const original = object[key];
  const mocked = t.mock.fn(implementation);
  object[key] = mocked;
  t.after(() => { object[key] = original; });
  return mocked;
}

function fixture(t, initial = lecture()) {
  let row = initial;
  const events = [];
  const io = { to() { return this; }, emit(event, payload) { events.push({ event, payload }); } };
  mockMethod(t, prisma, '$transaction', async work => work(prisma));
  mockMethod(t, prisma.session, 'findUnique', async () => row);
  const update = mockMethod(t, prisma.session, 'updateMany', async ({ data }) => { row = { ...row, ...data }; return { count: 1 }; });
  const polls = mockMethod(t, prisma.poll, 'updateMany', async () => ({ count: 1 }));
  return { io, events, update, polls, row: () => row };
}

test('expiry is six hours from creation, including the exact boundary, not inactivity', () => {
  assert.equal(isSessionExpired(lecture(), new Date(now - 1)), false);
  assert.equal(isSessionExpired(lecture(), now), true);
  assert.equal(isSessionExpired(lecture(), new Date(+now + 1)), true);
  assert.equal(isSessionExpired(lecture({ is_active: false }), now), false);
  assert.equal(isSessionExpired(lecture({ deletion_job_id: 'pending' }), now), false);
  assert.equal(isSessionExpired(lecture({ started_at: 'invalid' }), now), false);
});

test('automatic end uses normal ended fields, closes polls and emits the existing event once', async t => {
  const f = fixture(t);
  const result = await finishSession(91, { expiredOnly: true, now, io: f.io });
  assert.equal(result.changed, true);
  assert.equal(result.session.is_active, false);
  assert.equal(result.session.is_paused, false);
  assert.equal(result.session.title, 'CPU');
  assert.equal(result.session.ended_at, now);
  assert.deepEqual(f.polls.mock.calls[0].arguments[0].where, { session_id: { in: [91] }, is_active: true });
  assert.deepEqual(f.events.find(e => e.event === 'session-ended').payload, { sessionId: 91, sessionCode: 'EXP123', message: 'The lecture has ended.' });
  assert.equal((await finishSession(91, { expiredOnly: true, now, io: f.io })).changed, false);
  assert.equal(f.update.mock.callCount(), 1);
  assert.equal(f.events.filter(e => e.event === 'session-ended').length, 1);
});

test('fresh lectures remain live and manual ending uses the same transition with ownership checks', async t => {
  const f = fixture(t, lecture({ started_at: now }));
  assert.equal((await finishSession(91, { expiredOnly: true, now, io: f.io })).changed, false);
  await assert.rejects(finishSession(91, { user: { id: 72, role: 'teacher' }, now }), { status: 403 });
  assert.equal(f.update.mock.callCount(), 0);
  assert.equal((await finishSession(91, { user: teacher, now, io: f.io })).changed, true);
  assert.equal(f.polls.mock.callCount(), 1);
});

test('catch-up sweep rechecks due sessions inside the transaction and closes them together', async t => {
  const f = fixture(t);
  const probe = mockMethod(t, prisma.session, 'findFirst', async () => ({ id: 91 }));
  const rows = [lecture(), lecture({ id: 92, session_code: 'EXP124', started_at: new Date(now - 2 * SESSION_LIFETIME_MS) })];
  const find = mockMethod(t, prisma.session, 'findMany', async () => rows);
  const result = await expireDueSessions(f.io, now);
  assert.equal(result.length, 2);
  assert.equal(probe.mock.calls[0].arguments[0].where.started_at.lte.getTime(), now - SESSION_LIFETIME_MS);
  assert.equal(find.mock.calls[0].arguments[0].where.deletion_job_id, null);
  assert.deepEqual(f.update.mock.calls[0].arguments[0].where.id.in, [91, 92]);
  assert.equal(f.polls.mock.callCount(), 1);
  assert.equal(f.events.filter(e => e.event === 'session-ended').length, 2);
});

test('idle sweeps skip transactions and overlapping sweeps share one check', async t => {
  let complete;
  const probe = mockMethod(t, prisma.session, 'findFirst', () => new Promise(resolve => { complete = resolve; }));
  const tx = mockMethod(t, prisma, '$transaction', async () => { throw new Error('not needed'); });
  const a = expireDueSessions(null, now), b = expireDueSessions(null, now);
  assert.equal(a, b);
  complete(null);
  assert.deepEqual(await a, []);
  assert.equal(probe.mock.callCount(), 1);
  assert.equal(tx.mock.callCount(), 0);
});

test('request-time code access catches up after a sleeping backend and returns normal ended state', async t => {
  const f = fixture(t, lecture({ started_at: new Date(Date.now() - SESSION_LIFETIME_MS - 1000) }));
  configureSessionExpiry(f.io);
  t.after(() => configureSessionExpiry(undefined));
  const result = await sessionAccess({ id: 72, role: 'student' }, 'EXP123', { code: true });
  assert.equal(result.is_active, false);
  assert.equal(f.events.filter(e => e.event === 'session-ended').length, 1);
});

test('transaction failures do not emit a successful ending or close polls', async t => {
  const f = fixture(t);
  mockMethod(t, prisma, '$transaction', async () => { throw new Error('database unavailable'); });
  await assert.rejects(finishSession(91, { io: f.io, now }), /database unavailable/);
  assert.equal(f.events.length, 0);
  assert.equal(f.polls.mock.callCount(), 0);
});

test('poll votes and question upvotes reject an overdue lecture even before a sweep', async t => {
  const row = lecture({ started_at: new Date(Date.now() - SESSION_LIFETIME_MS - 1) });
  fixture(t, row);
  await assert.rejects(mutatePoll({ id: 72, role: 'student' }, 91, 'vote', {}), { status: 409 });
  mockMethod(t, prisma.question, 'findUnique', async () => ({ id: 93, session: row, session_id: 91, status: 'PENDING' }));
  const writes = mockMethod(t, prisma.vote, 'create', async () => { throw new Error('must not vote'); });
  let error;
  await upvoteQuestion({ params: { id: 93 }, user: { id: 72, role: 'student' } }, {}, err => { error = err; });
  assert.equal(error.status, 409);
  assert.equal(writes.mock.callCount(), 0);
});

test('a submission crossing its deadline before persistence is rejected without creation', async t => {
  fixture(t, lecture({ started_at: new Date(Date.now() - SESSION_LIFETIME_MS - 1) }));
  const create = mockMethod(t, prisma.question, 'create', async () => { throw new Error('must not create'); });
  let error;
  await createQuestion({ body: { session_id: 91, question_text: 'Instructor note', content_type: 'NOTE' }, user: teacher }, {}, err => { error = err; });
  assert.equal(error.status, 409);
  assert.equal(create.mock.callCount(), 0);
});
