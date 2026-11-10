// Opt-in integration check. Uses real disposable database rows and Socket.io clients.
// Clerk verification is mocked ONLY in this short-lived, loopback-only test server.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';

if (process.env.RUN_DB_TESTS !== '1') throw new Error('Set RUN_DB_TESTS=1 to create and clean up disposable integration data');
// Synthetic provider responses exist only inside this isolated harness.
// No fixture or personal data is sent to an external model.
process.env.GEMINI_API_KEY = 'integration-fixture-not-a-real-key';
const realFetch = globalThis.fetch;
let moderationAvailable = true;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
    const prompt = JSON.parse(options.body || '{}').contents?.[0]?.parts?.[0]?.text || '';
    if (moderationAvailable && prompt.startsWith('Review this classroom')) return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"isSafe":true,"category":"safe"}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('{}', { status: 503 });
  }
  return realFetch(url, options);
};
const { default: prisma } = await import('../src/config/prisma.js');
const { default: redis } = await import('../src/config/redis.js');
const { clerk } = await import('../src/middleware/authMiddleware.js');
const { initSocket } = await import('../src/socket/socketHandler.js');
const { deleteLectures, removeCourse } = await import('../src/utils/sessionLifecycle.js');
const { retryAssetCleanup } = await import('../src/utils/storageLifecycle.js');
const { invalidateSession } = await import('../src/utils/classroomEvents.js');
const { default: sessions } = await import('../src/routes/sessionRoutes.js');
const { default: userRoutes } = await import('../src/routes/userRoutes.js');
const { default: courses } = await import('../src/routes/courseRoutes.js');
const { default: questions } = await import('../src/routes/questionRoutes.js');
const { default: materials } = await import('../src/routes/materialRoutes.js');
const { default: uploads } = await import('../src/routes/uploadRoutes.js');
const { default: bookmarks } = await import('../src/routes/bookmarkRoutes.js');
const { queueLectureDeletion, processDeletionJobs } = await import('../src/utils/sessionDeletionJobs.js');
const { classroomTransaction } = await import('../src/utils/transaction.js');
const { default: cloudinary } = await import('../src/config/cloudinary.js');
const destroyedAssets = [];
const destroy = cloudinary.uploader.destroy.bind(cloudinary.uploader);
cloudinary.uploader.destroy = async (id, options) => { destroyedAssets.push(id); return destroy(id, options); };
const require = createRequire(import.meta.url);
const { io: connect } = require('../../frontend/node_modules/socket.io-client');
const prefix = 'qa-phase2-' + randomUUID();
const users = [];
const clients = [];
const checks = [];
let server, io, base;
const tokenToSubject = new Map();
clerk.verifyToken = async token => {
  if (!tokenToSubject.has(token)) throw new Error('Invalid test token');
  return { sub: tokenToSubject.get(token) };
};
const app = express().use(express.json()).use('/api/users', userRoutes).use('/api/sessions', sessions).use('/api/courses', courses).use('/api/questions', questions).use('/api/materials', materials)
  .use('/api/upload', uploads).use('/api/bookmarks', bookmarks)
  .use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
async function start() {
  server = createServer(app); io = new Server(server); app.set('io', io); initSocket(io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
}
async function stop() { clients.splice(0).forEach(c => c.disconnect()); if (io) await new Promise(resolve => io.close(resolve)); }
async function user(name, role) {
  const entry = await prisma.user.create({ data: { clerk_user_id: prefix + '-' + name, email: prefix + '-' + name + '@example.test', role, name: 'Disposable ' + name } });
  entry.token = randomUUID(); tokenToSubject.set(entry.token, entry.clerk_user_id); users.push(entry); return entry;
}
const interactionTimings = [];
async function api(who, path, method = 'GET', body) {
  const started = performance.now();
  const response = await fetch(base + '/api' + path, { method, headers: { Authorization: 'Bearer ' + who.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if ((method === 'POST' && path === '/sessions') || (method === 'DELETE' && /^\/sessions\/\d+$/.test(path)) || (method === 'PATCH' && /\/questions\/\d+\/status$/.test(path))) {
    interactionTimings.push({ method, resource: path.replace(/\d+/g, ':id'), ms: Math.round(performance.now() - started), serverTiming: response.headers.get('server-timing') });
  }
  return { status: response.status, data };
}
async function ok(who, path, method, body) {
  const result = await api(who, path, method, body);
  assert.ok(result.status < 300, path + ': ' + JSON.stringify(result)); return result.data;
}
async function socket(who, code) {
  const client = connect(base, { transports: ['websocket'], auth: { token: who.token }, reconnection: false });
  clients.push(client); client.events = [];
  client.onAny((event, data) => client.events.push({ event, data }));
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  const joined = await emit(client, 'join-session', code); assert.equal(joined.ok, true); return client;
}
function emit(client, event, data) {
  return new Promise((resolve, reject) => client.timeout(20000).emit(event, data, (err, reply) => err ? reject(err) : resolve(reply)));
}
async function until(check) {
  const end = Date.now() + 45000;
  while (!check()) { if (Date.now() > end) throw new Error('Socket notification did not arrive'); await new Promise(r => setTimeout(r, 25)); }
}
function passed(name) { checks.push(name); console.log('PASS ' + name); }

try {
  const host = await user('host', 'teacher'), student = await user('student', 'student'), outsider = await user('other-host', 'teacher');
  await start();
  const getUser = clerk.users.getUser;
  clerk.users.getUser = async subject => ({ primaryEmailAddressId: 'fixture', emailAddresses: [{ id: 'fixture', emailAddress: subject + '@example.test', verification: { status: 'verified' } }], firstName: 'Disposable' });
  try {
    for (const role of ['teacher', 'student']) {
      const identity = { token: randomUUID() };
      tokenToSubject.set(identity.token, prefix + '-new-' + role);
      const created = await ok(identity, '/users/sync', 'POST', { role });
      users.push({ ...created, token: identity.token });
      assert.equal(created.role, role);
      assert.equal(created.can_switch_role, false);
      assert.equal((await api(identity, '/users/sync', 'POST', { role: role === 'teacher' ? 'student' : 'teacher' })).status, 403);
    }
  } finally { clerk.users.getUser = getUser; }
  passed('new identities choose teacher/student once and cannot switch through profile sync');
  const course = await ok(host, '/courses', 'POST', { course_code: 'QA-' + randomUUID().slice(0, 8), title: 'Disposable classroom test' });
  const room = await ok(host, '/sessions', 'POST', { title: 'Disposable lecture A', course_id: course.id });
  const other = await ok(outsider, '/sessions', 'POST', { title: 'Disposable lecture B' });
  await ok(student, '/sessions/' + room.session_code + '/bundle');
  const h = await socket(host, room.session_code), st = await socket(student, room.session_code), isolated = await socket(outsider, other.session_code);
  await ok(host, '/sessions/teacher/' + host.id); // Warm the teacher cache before mutation.
  const q = await ok(student, '/questions', 'POST', { session_id: room.id, question_text: 'Why does a page fault occur?' });
  await until(() => h.events.some(e => e.event === 'question-received' && e.data.id === q.id));
  assert.equal(h.events.filter(e => e.event === 'question-received' && e.data.id === q.id).length, 1);
  assert.equal(isolated.events.filter(e => e.event === 'question-received').length, 0);
  assert.equal((await ok(host, '/sessions/teacher/' + host.id))[0].questions.length, 1);
  passed('one server-published question event; unrelated room isolated; warm teacher cache refreshed');

  assert.equal(q.moderation_status, 'checked');
  const retryStudent = await user('retry-student', 'student');
  await ok(retryStudent, '/sessions/' + room.session_code + '/bundle');
  moderationAvailable = false;
  const blocked = await api(retryStudent, '/questions', 'POST', { session_id: room.id, question_text: 'Explain virtual memory prerequisites' });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.data.code, 'MODERATION_UNAVAILABLE');
  moderationAvailable = true;
  assert.equal((await ok(host, '/sessions/' + room.session_code + '/bundle')).questions.length, 1);
  passed('unavailable moderation returns a retryable error and never publishes unchecked text');

  assert.equal((await emit(h, 'pause-session', room.session_code)).ok, true);
  assert.equal((await api(student, '/questions', 'POST', { session_id: room.id, question_text: 'Another academic question' })).status, 409);
  const late = await socket(student, room.session_code);
  assert.equal(late.events.find(e => e.event === 'session-state').data.isPaused, true);
  assert.equal((await emit(st, 'resume-session', room.session_code)).ok, false);
  passed('pause survives late joining and rejects direct submissions/non-owner controls');

  const broadcast = await ok(host, '/questions', 'POST', { session_id: room.id, content_type: 'CODE', question_text: 'Page table example', code_snippet: 'page_table[index]', code_language: 'python' });
  assert.equal(broadcast.status, 'PINNED');
  assert.equal((await ok(host, '/sessions/' + room.session_code + '/bundle')).questions.find(x => x.id === broadcast.id).content_type, 'CODE');
  assert.equal((await emit(h, 'resume-session', room.session_code)).ok, true);
  const votes = await Promise.all([api(student, '/questions/' + q.id + '/upvote', 'POST', {}), api(student, '/questions/' + q.id + '/upvote', 'POST', {})]);
  assert.deepEqual(votes.map(v => v.status).sort(), [200, 409]);
  assert.equal((await prisma.question.findUnique({ where: { id: q.id } })).upvotes, 1);
  assert.ok((await ok(student, '/sessions/' + room.session_code + '/bundle')).votedIds.includes(q.id));
  passed('broadcast pin persists and concurrent duplicate upvotes count exactly once');

  const launched = await emit(h, 'start-poll', { sessionCode: room.session_code, poll: { question: 'Is the concept clear?', options: ['Yes', 'Another example'] } });
  assert.equal(launched.ok, true);
  const pollVotes = await Promise.all([emit(st, 'vote-poll', { sessionCode: room.session_code, pollId: launched.poll.id, optionIndex: 0, voterId: 99999 }), emit(late, 'vote-poll', { sessionCode: room.session_code, pollId: launched.poll.id, optionIndex: 0, voterId: 88888 })]);
  assert.equal(pollVotes.filter(v => v.ok).length, 1);
  assert.equal(await prisma.pollVote.count({ where: { poll_id: launched.poll.id } }), 1);
  assert.equal((await prisma.pollOption.findFirst({ where: { poll_id: launched.poll.id, index: 0 } })).votes, 1);
  passed('poll identity cannot be forged; concurrent votes are atomic');

  await emit(h, 'pause-session', room.session_code);
  await stop(); await start();
  const h2 = await socket(host, room.session_code), s2 = await socket(student, room.session_code), other2 = await socket(outsider, other.session_code);
  const recovered = s2.events.find(e => e.event === 'session-state').data;
  assert.equal(recovered.isPaused, true); assert.equal(recovered.poll.totalVotes, 1); assert.equal(recovered.poll.myVote, 0);
  await emit(h2, 'resume-session', room.session_code);
  passed('backend/socket restart restores pause, poll and the participant’s saved vote');

  await ok(host, '/questions/' + q.id + '/answer-text', 'PATCH', { answer_text: 'A missing page must be loaded into physical memory.' });
  await until(() => s2.events.some(e => e.event === 'question-updated' && e.data.answer_text));
  await ok(student, '/sessions/history/student/' + student.id); // Warm history before ending.
  await ok(host, '/sessions/' + room.id + '/end', 'PATCH', {});
  await until(() => s2.events.some(e => e.event === 'session-ended'));
  assert.equal(other2.events.filter(e => e.event === 'session-ended' || e.event === 'session-closed').length, 0);
  assert.ok((await ok(student, '/sessions/history/student/' + student.id)).some(s => s.id === room.id));
  assert.equal((await prisma.poll.findUnique({ where: { id: launched.poll.id } })).is_active, false);
  passed('written answers publish; ending closes polls and updates history without affecting another room');

  const queued = await api(host, '/sessions/' + room.id, 'DELETE');
  assert.equal(queued.status, 202);
  assert.equal((await api(student, '/sessions/' + room.session_code + '/bundle')).status, 410);
  await until(() => s2.events.some(e => e.event === 'session-closed'));
  await until(() => h2.events.some(e => e.event === 'session-deleted' && e.data.sessionId === room.id));
  assert.equal(await prisma.question.count({ where: { session_id: room.id } }), 0);
  assert.equal(await prisma.poll.count({ where: { session_id: room.id } }), 0);
  assert.equal((await ok(student, '/sessions/history/student/' + student.id)).some(s => s.id === room.id), false);
  assert.equal((await ok(host, '/courses/' + course.id)).sessions.length, 0);
  passed('transactional lecture pruning removes dependent data and invalidates history/course caches');

  await assert.rejects(classroomTransaction(async tx => {
    await tx.session.update({ where: { id: other.id }, data: { is_paused: true } });
    throw new Error('Intentional rollback');
  }), /Intentional rollback/);
  assert.equal((await prisma.session.findUnique({ where: { id: other.id } })).is_paused, false);
  passed('failed transaction rolls back rather than leaving partial lifecycle state');

  const recoverRoom = await ok(host, '/sessions', 'POST', { title: 'Durable cleanup recovery', course_id: course.id });
  const durable = await queueLectureDeletion(host, [recoverRoom.id]);
  assert.equal(durable.job.status, 'QUEUED');
  assert.equal((await api(student, '/sessions/' + recoverRoom.session_code + '/bundle')).status, 410);
  await processDeletionJobs(io);
  assert.equal(await prisma.session.count({ where: { id: recoverRoom.id } }), 0);
  assert.equal((await prisma.sessionDeletionJob.findUnique({ where: { id: durable.job.id } })).status, 'COMPLETED');
  passed('persisted deletion job blocks access and completes when the worker resumes');

  const batchA = await ok(host, '/sessions', 'POST', { title: 'Batch A', course_id: course.id });
  const batchB = await ok(host, '/sessions', 'POST', { title: 'Batch B', course_id: course.id });
  const publicId = 'askanon/qa-' + randomUUID();
  const image = await prisma.sessionMedia.create({ data: { session_id: batchA.id, image_url: 'https://res.cloudinary.com/' + process.env.CLOUDINARY_CLOUD_NAME + '/image/upload/v1/' + publicId + '.png', public_id: publicId } });
  const saved = await ok(host, '/materials/from-media', 'POST', { session_id: batchA.id, media_id: image.id, title: 'Retained whiteboard' });
  await ok(host, '/upload/media/' + encodeURIComponent(publicId), 'DELETE');
  await retryAssetCleanup();
  assert.ok(await prisma.courseMaterial.findUnique({ where: { id: saved.id } }));
  assert.equal(destroyedAssets.includes(publicId), false);
  passed('removing gallery image retains its shared vault asset');

  const batchQuestion = await ok(host, '/questions', 'POST', { session_id: batchA.id, content_type: 'NOTE', question_text: 'Retained explanation' });
  await ok(student, '/bookmarks/' + batchQuestion.id + '/toggle', 'POST', {});
  await ok(host, '/courses/' + course.id); // Warm detail cache.
  const beforeBatchEvents = h2.events.filter(e => e.event === 'sessions-batch-deleted').length;
  await ok(host, '/sessions/batch-delete', 'POST', { sessionIds: [batchA.id, batchB.id] });
  await until(() => h2.events.filter(e => e.event === 'sessions-batch-deleted').length > beforeBatchEvents);
  assert.equal(h2.events.filter(e => e.event === 'sessions-batch-deleted').length - beforeBatchEvents, 1);
  assert.equal((await prisma.courseMaterial.findUnique({ where: { id: saved.id } })).session_id, null);
  assert.equal((await ok(student, '/bookmarks/my')).length, 0);
  assert.equal((await ok(host, '/courses/' + course.id)).sessions.length, 0);
  passed('batch deletion notifies once, prunes bookmarks and preserves vault material');

  await ok(host, '/courses/' + course.id, 'DELETE');
  const expiry = Date.now() + 20000;
  while (await prisma.storageCleanup.count({ where: { public_id: publicId } })) {
    if (Date.now() > expiry) throw new Error('Storage cleanup did not finish');
    await retryAssetCleanup(); await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(destroyedAssets.includes(publicId));
  passed('last-reference removal processes the durable storage cleanup job');
  console.log(JSON.stringify({ checksPassed: checks.length, independentUsers: users.length, restartTested: true, interactionTimings }));
} finally {
  await stop();
  for (const who of users.filter(u => u.role === 'teacher')) {
    const owned = await prisma.session.findMany({ where: { teacher_id: who.id }, select: { id: true } });
    if (owned.length) { const removed = await deleteLectures(who, owned.map(s => s.id)); for (const s of removed) await invalidateSession(s); }
    const ownedCourses = await prisma.course.findMany({ where: { teacher_id: who.id }, select: { id: true } });
    for (const c of ownedCourses) await removeCourse(who, c.id);
  }
  await prisma.courseEnrollment.deleteMany({ where: { user_id: { in: users.map(u => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(u => u.id) }, clerk_user_id: { startsWith: prefix } } });
  await retryAssetCleanup();
  console.log('Disposable integration records cleaned up');
  await prisma.$disconnect();
  if (redis.isOpen) await redis.quit();
}
