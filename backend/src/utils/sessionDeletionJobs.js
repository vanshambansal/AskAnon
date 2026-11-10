import { randomUUID } from 'node:crypto';
import prisma from '../config/prisma.js';
import { classroomTransaction } from './transaction.js';
import { assertOwner, fail } from '../middleware/accessMiddleware.js';
import { deleteLectures } from './sessionLifecycle.js';
import { invalidateSession, workspaceChanged } from './classroomEvents.js';
import { publishDeleted } from './sessionDeletionEvents.js';

export const deletionJobSelect = { id: true, status: true, attempts: true, error: true, created_at: true };
const snapshot = session => ({ id: session.id, teacher_id: session.teacher_id, course_id: session.course_id, session_code: session.session_code });

export async function queueLectureDeletion(user, ids, batch = false) {
  return classroomTransaction(async tx => {
    const sessions = await tx.session.findMany({ where: { id: { in: ids } }, include: { deletionJob: { select: deletionJobSelect } } });
    if (sessions.length !== ids.length) fail(404, 'One or more lectures no longer exist');
    sessions.forEach(session => assertOwner(user, session.teacher_id));
    const existing = sessions.find(session => session.deletion_job_id);
    if (existing) {
      if (!sessions.every(session => session.deletion_job_id === existing.deletion_job_id)) fail(409, 'Some selected lectures are already queued. Select only lectures that are not being deleted.');
      return { job: existing.deletionJob, sessions: sessions.map(snapshot) };
    }
    const job = await tx.sessionDeletionJob.create({ data: { owner_id: user.id, sessions: sessions.map(snapshot), batch }, select: deletionJobSelect });
    await tx.session.updateMany({ where: { id: { in: ids } }, data: { deletion_job_id: job.id } });
    return { job, sessions: sessions.map(snapshot) };
  });
}

export async function retryLectureDeletion(user, jobId) {
  const job = await prisma.sessionDeletionJob.findUnique({ where: { id: jobId } });
  if (!job) fail(404, 'Deletion job not found');
  assertOwner(user, job.owner_id);
  if (job.status === 'FAILED') await prisma.sessionDeletionJob.updateMany({
    where: { id: job.id, owner_id: user.id, status: 'FAILED' },
    data: { status: 'QUEUED', attempts: 0, available_at: new Date(), error: null, lease_until: null, lease_token: null }
  });
  return job.sessions;
}

export async function announceDeletion(io, sessions) {
  await Promise.all(sessions.map(invalidateSession));
  for (const session of sessions) {
    io?.to(session.session_code).emit('session-closed', {
      sessionId: session.id, sessionCode: session.session_code,
      message: 'The instructor has queued this lecture for deletion. It is no longer available.'
    });
    workspaceChanged(io, session, { deletionPending: true });
  }
}

let running = false;
export async function processDeletionJobs(io) {
  if (running) return;
  running = true;
  try {
    for (let processed = 0; processed < 4; processed++) {
      const now = new Date();
      const eligible = { OR: [
        { status: 'QUEUED', available_at: { lte: now } },
        { status: 'RUNNING', lease_until: { lte: now } }
      ] };
      const job = await prisma.sessionDeletionJob.findFirst({ where: eligible, orderBy: { created_at: 'asc' } });
      if (!job) break;
      const token = randomUUID();
      const claim = await prisma.sessionDeletionJob.updateMany({ where: { id: job.id, ...eligible }, data: {
        status: 'RUNNING', lease_until: new Date(Date.now() + 120000), lease_token: token, attempts: { increment: 1 }
      } });
      if (!claim.count) continue;
      try {
        const ids = job.sessions.map(session => session.id);
        // Recovery after a crash between pruning and completion is idempotent.
        const remaining = await prisma.session.findMany({ where: { id: { in: ids } }, select: { id: true, teacher_id: true } });
        const owner = { id: job.owner_id, role: 'teacher' };
        remaining.forEach(session => assertOwner(owner, session.teacher_id));
        if (remaining.length) await deleteLectures(owner, remaining.map(session => session.id));
        const completed = await prisma.sessionDeletionJob.updateMany({ where: { id: job.id, lease_token: token }, data: {
          status: 'COMPLETED', error: null, lease_until: null, lease_token: null
        } });
        if (completed.count) await publishDeleted(io, job.sessions, job.batch);
      } catch {
        const failed = job.attempts + 1 >= 3;
        await prisma.sessionDeletionJob.updateMany({ where: { id: job.id, lease_token: token }, data: {
          status: failed ? 'FAILED' : 'QUEUED', available_at: new Date(Date.now() + 10000 * (job.attempts + 1)),
          error: failed ? 'Cleanup could not finish. Retry deletion; classroom data was not partially pruned.' : null,
          lease_until: null, lease_token: null
        } });
        await Promise.all(job.sessions.map(invalidateSession));
        job.sessions.forEach(session => workspaceChanged(io, session, { deletionPending: true }));
      }
    }
  } finally { running = false; }
}

export function kickDeletionWorker(io, sessions) {
  // Durability comes from the committed job, not this scheduling convenience.
  setImmediate(async () => {
    try { if (sessions) await announceDeletion(io, sessions); await processDeletionJobs(io); }
    catch { console.warn('Lecture cleanup will retry on the next worker tick'); }
  });
}
