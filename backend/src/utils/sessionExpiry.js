import prisma from '../config/prisma.js';
import { classroomTransaction } from './transaction.js';
import { invalidateSession, roomEvent } from './classroomEvents.js';

export const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;
let expiryIO;
export function configureSessionExpiry(io) { expiryIO = io; }
export function isSessionExpired(session, now = Date.now()) {
  const started = new Date(session?.started_at).getTime();
  return Boolean(session?.is_active && !session.deletion_job_id && Number.isFinite(started) && started + SESSION_LIFETIME_MS <= Number(now));
}

// Called only with rows read inside a Serializable transaction. Manual and
// automatic ending use the same persisted state and poll closure.
async function finishRows(tx, sessions, now) {
  if (!sessions.length) return [];
  const ids = sessions.map(session => session.id);
  await tx.session.updateMany({ where: { id: { in: ids }, is_active: true, deletion_job_id: null }, data: { is_active: false, is_paused: false, ended_at: now } });
  await tx.poll.updateMany({ where: { session_id: { in: ids }, is_active: true }, data: { is_active: false, ended_at: now } });
  return sessions.map(session => ({ ...session, is_active: false, is_paused: false, ended_at: now }));
}

async function announce(io, sessions) {
  for (const session of sessions) {
    // Notification/cache failures must not report a committed end as a failure.
    try { await invalidateSession(session); } catch { console.warn('Ended lecture cache refresh unavailable'); }
    roomEvent(io, session, 'session-ended', { sessionId: session.id, sessionCode: session.session_code, message: 'The lecture has ended.' });
  }
}

export async function finishSession(id, { user, io = expiryIO, expiredOnly = false, now = new Date() } = {}) {
  const result = await classroomTransaction(async tx => {
    const existing = await tx.session.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error('Session not found'), { status: 404 });
    if (user && (user.role !== 'teacher' || user.id !== existing.teacher_id)) throw Object.assign(new Error('Only the owner can end this lecture'), { status: 403 });
    if (existing.deletion_job_id) throw Object.assign(new Error('This lecture is queued for deletion'), { status: 410 });
    if (!existing.is_active || (expiredOnly && !isSessionExpired(existing, now))) return { session: existing, changed: false };
    const [session] = await finishRows(tx, [existing], now);
    return { session, changed: true };
  });
  if (result.changed) await announce(io, [result.session]);
  return result;
}

let pendingSweep;
export function expireDueSessions(io, now = new Date()) {
  if (pendingSweep) return pendingSweep;
  pendingSweep = (async () => {
    const where = { is_active: true, deletion_job_id: null, started_at: { lte: new Date(now.getTime() - SESSION_LIFETIME_MS) } };
    // Avoid starting a transaction on ordinary requests with no overdue lecture.
    const due = await prisma.session.findFirst({ where, select: { id: true } });
    if (!due) return [];
    const sessions = await classroomTransaction(async tx => {
      const rows = await tx.session.findMany({ where });
      return finishRows(tx, rows, now);
    });
    await announce(io, sessions);
    return sessions;
  })().finally(() => { pendingSweep = null; });
  return pendingSweep;
}
