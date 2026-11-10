import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import express from 'express';

// These mocks exist only in this test process; there is no server test-token bypass.
process.env.REDIS_URL = '';
process.env.ALLOW_ROLE_SWITCH = 'false';
const { default: prisma } = await import('../src/config/prisma.js');
const { clerk, invalidateUserCache, rateLimiter, roleSwitchEnabled } = await import('../src/middleware/authMiddleware.js');
const { positiveId, assertOwner } = await import('../src/middleware/accessMiddleware.js');
const { default: sessions } = await import('../src/routes/sessionRoutes.js');
const { default: courses } = await import('../src/routes/courseRoutes.js');
const { default: questions } = await import('../src/routes/questionRoutes.js');
const { default: users } = await import('../src/routes/userRoutes.js');
const { default: materials } = await import('../src/routes/materialRoutes.js');
const { default: bookmarks } = await import('../src/routes/bookmarkRoutes.js');
let server, base;
function mockMethod(t, object, key, implementation) {
  const original = object[key];
  const mock = t.mock.fn(implementation);
  object[key] = mock;
  t.after(() => { object[key] = original; });
  return mock;
}
const teacher = { id: 1, clerk_user_id: 'teacher', role: 'teacher', email: 'teacher@example.test' };
const student = { id: 2, clerk_user_id: 'student', role: 'student', email: 'student@example.test' };

before(() => {
  server = express().use(express.json())
    .use('/sessions', sessions).use('/courses', courses).use('/questions', questions)
    .use('/users', users).use('/materials', materials).use('/bookmarks', bookmarks)
    .use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }))
    .listen(0, '127.0.0.1');
  return new Promise(resolve => server.once('listening', () => { base = 'http://127.0.0.1:' + server.address().port; resolve(); }));
});
after(async () => { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
beforeEach(t => {
  invalidateUserCache('teacher'); invalidateUserCache('student');
  t.mock.method(clerk, 'verifyToken', async token => {
    if (!['teacher', 'student'].includes(token)) throw new Error('Invalid token');
    return { sub: token };
  });
  mockMethod(t, prisma.user, 'findUnique', async ({ where }) => where.clerk_user_id === 'teacher' ? teacher : student);
  mockMethod(t, prisma.session, 'findUnique', async () => ({ id: 10, teacher_id: 99, course_id: 20, session_code: 'ABC123', is_active: true }));
  mockMethod(t, prisma.course, 'findUnique', async () => ({ id: 20, teacher_id: 99 }));
  mockMethod(t, prisma.courseEnrollment, 'findUnique', async () => null);
});
async function request(path, { token, method = 'GET', body } = {}) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
}

test('invalid identifiers and non-owner management are rejected', () => {
  for (const value of ['1x', '0', '-1', '1.5', null]) assert.throws(() => positiveId(value));
  assert.equal(positiveId('10'), 10);
  assert.throws(() => assertOwner(student, student.id), { status: 403 });
  assert.throws(() => assertOwner(teacher, 99), { status: 403 });
  assert.doesNotThrow(() => assertOwner(teacher, teacher.id));
});

test('session, moderation, upload, profile and vault routes reject anonymous/invalid tokens', async () => {
  for (const [path, method] of [['/sessions/10', 'DELETE'], ['/sessions/batch-delete', 'POST'], ['/questions/10/status', 'PATCH'], ['/materials/upload', 'POST'], ['/users/sync', 'POST'], ['/courses/20', 'GET']]) {
    assert.equal((await request(path, { method, body: {} })).status, 401, path);
    assert.equal((await request(path, { method, body: {}, token: 'dev-test-token' })).status, 401, path);
  }
});

test('a teacher cannot delete another teacher’s session or select their dashboard', async t => {
  mockMethod(t, prisma, '$transaction', async work => work(prisma));
  mockMethod(t, prisma.session, 'findMany', async () => [{ id: 10, teacher_id: 99 }]);
  assert.equal((await request('/sessions/10', { token: 'teacher', method: 'DELETE' })).status, 403);
  assert.equal((await request('/sessions/teacher/99', { token: 'teacher' })).status, 403);
});

test('batch authorization runs before any deletion', async t => {
  mockMethod(t, prisma, '$transaction', async work => work(prisma));
  mockMethod(t, prisma.session, 'findMany', async () => [{ id: 10, teacher_id: 99 }]);
  const deletion = mockMethod(t, prisma.courseMaterial, 'updateMany', async () => { throw new Error('must not delete'); });
  assert.equal((await request('/sessions/batch-delete', { token: 'teacher', method: 'POST', body: { sessionIds: [10] } })).status, 403);
  assert.equal(deletion.mock.callCount(), 0);
});

test('students cannot create courses or read unenrolled course materials', async () => {
  assert.equal((await request('/courses', { token: 'student', method: 'POST', body: { teacher_id: 1 } })).status, 403);
  assert.equal((await request('/courses/20', { token: 'student' })).status, 403);
});

test('duplicate course creation returns a conflict when the unique constraint wins', async t => {
  mockMethod(t, prisma.course, 'create', async () => { throw Object.assign(new Error('Duplicate code'), { code: 'P2002' }); });
  const response = await request('/courses', { token: 'teacher', method: 'POST', body: { course_code: 'CS101', title: 'Computer systems' } });
  assert.equal(response.status, 409);
});

test('profile sync binds identity to the token and disallows role escalation when disabled', async t => {
  assert.equal((await request('/users/sync', { token: 'student', method: 'POST', body: { role: 'teacher', clerk_user_id: 'teacher' } })).status, 403);
  const upsert = mockMethod(t, prisma.user, 'upsert', async ({ where }) => ({ ...student, clerk_user_id: where.clerk_user_id }));
  const r = await request('/users/sync', { token: 'student', method: 'POST', body: { clerk_user_id: 'teacher', email: 'forged@example.test' } });
  assert.equal(r.status, 200);
  assert.equal(upsert.mock.calls[0].arguments[0].where.clerk_user_id, 'student');
  assert.equal(upsert.mock.calls[0].arguments[0].create.email, student.email);
});

test('production ignores the development role-switch flag', () => {
  const oldNode = process.env.NODE_ENV;
  process.env.ALLOW_ROLE_SWITCH = 'true'; process.env.NODE_ENV = 'production';
  try { assert.equal(roleSwitchEnabled(), false); }
  finally { process.env.ALLOW_ROLE_SWITCH = 'false'; if (oldNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNode; }
});

test('a new identity can choose teacher once in production; existing roles never update', async t => {
  mockMethod(t, prisma.user, 'findUnique', async () => null);
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (prior === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior; });
  t.mock.method(clerk.users, 'getUser', async () => ({ primaryEmailAddressId: 'verified', emailAddresses: [{ id: 'verified', emailAddress: 'verified@example.test', verification: { status: 'verified' } }], firstName: 'Test' }));
  const upsert = mockMethod(t, prisma.user, 'upsert', async ({ create }) => ({ id: 97, ...create }));
  const noRole = await request('/users/sync', { token: 'student', method: 'POST', body: {} });
  assert.equal(noRole.status, 409);
  assert.equal((await noRole.json()).code, 'ROLE_REQUIRED');
  const response = await request('/users/sync', { token: 'student', method: 'POST', body: { role: 'teacher', email: 'forged@example.test' } });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.role, 'teacher');
  assert.equal(profile.email, 'verified@example.test');
  assert.equal(profile.can_switch_role, false);
  assert.deepEqual(upsert.mock.calls[0].arguments[0].update, {});
});

test('a development flag cannot change an existing registration role', async () => {
  process.env.ALLOW_ROLE_SWITCH = 'true';
  try { assert.equal((await request('/users/sync', { token: 'student', method: 'POST', body: { role: 'teacher' } })).status, 403); }
  finally { process.env.ALLOW_ROLE_SWITCH = 'false'; }
});

test('bookmark reads cannot select another account through user_id', async t => {
  const find = mockMethod(t, prisma.bookmark, 'findMany', async () => []);
  const r = await request('/bookmarks/my?user_id=99', { token: 'student' });
  assert.equal(r.status, 200);
  assert.equal(find.mock.calls[0].arguments[0].where.user_id, student.id);
});

test('download proxy rejects arbitrary hosts before performing an upstream fetch', async () => {
  const r = await request('/materials/proxy-download?url=' + encodeURIComponent('http://127.0.0.1/private'), { token: 'student' });
  assert.equal(r.status, 400);
});

test('local fallback blocks simultaneous submissions and returns retry metadata', async () => {
  const statuses = [];
  const response = { setHeader() {}, status(code) { statuses.push(code); return this; }, json(body) { assert.ok(body.retry_after > 0); } };
  let accepted = 0;
  await Promise.all([1, 2].map(() => rateLimiter({ user: { id: 987654 } }, response, () => accepted++)));
  assert.equal(accepted, 1);
  assert.deepEqual(statuses, [429]);
});

test('a rejected moderation draft can retry without clearing an abuse penalty', async () => {
  const { penalizeUserRateLimit } = await import('../src/middleware/authMiddleware.js');
  const response = () => Object.assign(new EventEmitter(), {
    locals: {}, setHeader() {}, status(code) { this.statusCode = code; return this; }, json() {}
  });
  const req = { user: { id: 987655 } };
  let accepted = 0;
  const first = response();
  await rateLimiter(req, first, () => accepted++);
  first.locals.releaseSubmissionCooldown = true;
  first.emit('finish');
  const retry = response();
  await rateLimiter(req, retry, () => accepted++);
  assert.equal(accepted, 2);
  await penalizeUserRateLimit(req.user.id);
  retry.locals.releaseSubmissionCooldown = true;
  retry.emit('finish');
  const blocked = response();
  await rateLimiter(req, blocked, () => accepted++);
  assert.equal(accepted, 2);
  assert.equal(blocked.statusCode, 429);
});

test('create lecture binds teacher_id to the caller and validates empty titles', async t => {
  const create = mockMethod(t, prisma.session, 'create', async ({ data }) => ({ id: 77, ...data }));
  mockMethod(t, prisma.session, 'findUnique', async () => null);
  const invalid = await request('/sessions', { token: 'teacher', method: 'POST', body: { title: '   ', teacher_id: 99 } });
  assert.equal(invalid.status, 400);
  const valid = await request('/sessions', { token: 'teacher', method: 'POST', body: { title: 'Valid test lecture', teacher_id: 99 } });
  assert.equal(valid.status, 201);
  assert.equal(create.mock.calls[0].arguments[0].data.teacher_id, teacher.id);
});

test('verified code join enrolls only the caller and ignores a forged bookmark user_id', async t => {
  const enrollment = mockMethod(t, prisma.courseEnrollment, 'upsert', async () => ({}));
  mockMethod(t, prisma.question, 'findMany', async () => []);
  mockMethod(t, prisma.sessionMedia, 'findMany', async () => []);
  mockMethod(t, prisma.courseMaterial, 'findMany', async () => []);
  mockMethod(t, prisma.vote, 'findMany', async () => []);
  mockMethod(t, prisma.poll, 'findFirst', async () => null);
  const bookmarks = mockMethod(t, prisma.bookmark, 'findMany', async () => []);
  const response = await request('/sessions/ABC123/bundle?user_id=99', { token: 'student' });
  assert.equal(response.status, 200);
  assert.equal(enrollment.mock.calls[0].arguments[0].create.user_id, student.id);
  assert.equal(bookmarks.mock.calls[0].arguments[0].where.user_id, student.id);
});

test('database-response fallback caches reads and invalidation removes local entries', async () => {
  const { getOrSetCache, invalidateCache } = await import('../src/utils/cacheHelper.js');
  let queries = 0;
  const fetchValue = async () => ({ version: ++queries });
  const key = 'phase1-unit-cache';
  assert.equal((await getOrSetCache(key, 30, fetchValue)).version, 1);
  assert.equal((await getOrSetCache(key, 30, fetchValue)).version, 1);
  await invalidateCache(key);
  assert.equal((await getOrSetCache(key, 30, fetchValue)).version, 2);
  await invalidateCache(key);
});
