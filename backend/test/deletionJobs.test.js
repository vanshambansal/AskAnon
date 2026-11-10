import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.REDIS_URL = '';
const { default: prisma } = await import('../src/config/prisma.js');
const { queueLectureDeletion, retryLectureDeletion, processDeletionJobs } = await import('../src/utils/sessionDeletionJobs.js');
const session = { id: 41, teacher_id: 7, session_code: 'QA0041', course_id: null, deletion_job_id: null };
const owner = { id: 7, role: 'teacher' };
function patch(t, object, field, work) {
  const original = object[field]; object[field] = work;
  t.after(() => { object[field] = original; });
}

test('queueing persists an owner-checked job and session marker without pruning', async t => {
  const changes = [];
  patch(t, prisma, '$transaction', async work => work({
    session: { findMany: async () => [session], updateMany: async args => { changes.push(args); return { count: 1 }; } },
    sessionDeletionJob: { create: async ({ data }) => ({ id: 'durable-job', status: 'QUEUED', ...data }) }
  }));
  const result = await queueLectureDeletion(owner, [41]);
  assert.equal(result.job.status, 'QUEUED');
  assert.equal(changes[0].data.deletion_job_id, 'durable-job');
  assert.deepEqual(result.sessions, [{ id: 41, teacher_id: 7, session_code: 'QA0041', course_id: null }]);
  await assert.rejects(queueLectureDeletion({ id: 8, role: 'teacher' }, [41]), error => error.status === 403);
});

test('a duplicate queued request reuses the durable job; another owner cannot retry it', async t => {
  patch(t, prisma, '$transaction', async work => work({ session: { findMany: async () => [{ ...session, deletion_job_id: 'existing', deletionJob: { id: 'existing', status: 'RUNNING' } }] } }));
  assert.equal((await queueLectureDeletion(owner, [41])).job.id, 'existing');
  patch(t, prisma.sessionDeletionJob, 'findUnique', async () => ({ id: 'existing', owner_id: 7 }));
  await assert.rejects(retryLectureDeletion({ id: 8, role: 'teacher' }, 'existing'), error => error.status === 403);
});

test('a reclaimed job with already-pruned rows completes idempotently using its lease token', async t => {
  const job = { id: 'reclaimed', owner_id: 7, status: 'RUNNING', sessions: [session], attempts: 1, batch: false };
  let reads = 0; const writes = [];
  patch(t, prisma.sessionDeletionJob, 'findFirst', async () => reads++ ? null : job);
  patch(t, prisma.sessionDeletionJob, 'updateMany', async args => { writes.push(args); return { count: 1 }; });
  patch(t, prisma.session, 'findMany', async () => []);
  await processDeletionJobs(null);
  assert.equal(writes[0].data.status, 'RUNNING');
  assert.equal(writes[1].data.status, 'COMPLETED');
  assert.equal(writes[1].where.lease_token, writes[0].data.lease_token);
});

test('the owner can retry a failed job with a cleared lease and retry budget', async t => {
  patch(t, prisma.sessionDeletionJob, 'findUnique', async () => ({ id: 'failed', owner_id: 7, status: 'FAILED', sessions: [session] }));
  let change;
  patch(t, prisma.sessionDeletionJob, 'updateMany', async args => { change = args; return { count: 1 }; });
  assert.deepEqual(await retryLectureDeletion(owner, 'failed'), [session]);
  assert.equal(change.where.owner_id, 7);
  assert.equal(change.where.status, 'FAILED');
  assert.equal(change.data.status, 'QUEUED');
  assert.equal(change.data.attempts, 0);
  assert.equal(change.data.lease_token, null);
});

test('a lost lease never prunes rows; repeated cleanup failure becomes retryable FAILED', async t => {
  let reads = 0, pruned = false;
  const job = { id: 'failed-job', owner_id: 7, sessions: [session], attempts: 2 };
  const writes = [];
  patch(t, prisma.sessionDeletionJob, 'findFirst', async () => reads++ ? null : job);
  patch(t, prisma.sessionDeletionJob, 'updateMany', async args => { writes.push(args); return { count: 0 }; });
  patch(t, prisma.session, 'findMany', async () => { pruned = true; return [session]; });
  await processDeletionJobs(null);
  assert.equal(pruned, false);
  reads = 0; writes.length = 0;
  patch(t, prisma.sessionDeletionJob, 'updateMany', async args => { writes.push(args); return { count: 1 }; });
  patch(t, prisma, '$transaction', async () => { throw new Error('Rolled back'); });
  await processDeletionJobs(null);
  assert.equal(writes.at(-1).data.status, 'FAILED');
  assert.equal(writes.at(-1).data.lease_token, null);
});
