import { invalidateCache, invalidateCourseCache } from './cacheHelper.js';

export function workspaceChanged(io, session, extra = {}) {
  if (!io) return;
  let audience = io.to(`user:${session.teacher_id}`);
  if (session.course_id) audience = audience.to(`course:${session.course_id}`);
  audience.emit('workspace-updated', { sessionId: session.id, sessionCode: session.session_code, courseId: session.course_id, ...extra });
}

export async function invalidateSession(session) {
  await Promise.all([
    invalidateCache(`cache:session:code:${session.session_code}`, `cache:session:id:${session.id}`, `cache:sessions:teacher:${session.teacher_id}`, `cache:room:questions:${session.id}`, `cache:room:media:${session.id}`, `cache:materials:session:${session.id}`),
    invalidateCourseCache(session.course_id)
  ]);
}

export function roomEvent(io, session, event, payload) {
  io?.to(session.session_code).emit(event, payload);
  workspaceChanged(io, session);
}
