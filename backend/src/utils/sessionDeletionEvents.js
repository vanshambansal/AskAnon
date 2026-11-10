import { invalidateCache, invalidateCourseCache } from './cacheHelper.js';
import { workspaceChanged } from './classroomEvents.js';
import { retryAssetCleanup } from './storageLifecycle.js';

export async function publishDeleted(io, sessions, batch) {
  // Invalidate shared course metadata once per course, even for a large batch.
  await Promise.all([
    invalidateCache(...sessions.flatMap(session => [
      `cache:session:code:${session.session_code}`, `cache:session:id:${session.id}`,
      `cache:sessions:teacher:${session.teacher_id}`, `cache:room:questions:${session.id}`,
      `cache:room:media:${session.id}`, `cache:materials:session:${session.id}`
    ])),
    ...[...new Set(sessions.map(session => session.course_id).filter(Boolean))].map(invalidateCourseCache)
  ]);
  for (const session of sessions) {
    const payload = { sessionId: session.id, sessionCode: session.session_code, courseId: session.course_id };
    io?.to(session.session_code).emit('session-closed', { ...payload, message: 'This lecture was deleted by its instructor.' });
    let audience = io?.to('user:' + session.teacher_id);
    if (session.course_id) audience = audience?.to('course:' + session.course_id);
    if (!batch) audience?.emit('session-deleted', payload);
    workspaceChanged(io, session, { deleted: true });
  }
  if (batch && io) {
    let audience = io;
    const rooms = new Set(sessions.flatMap(s => ['user:' + s.teacher_id, ...(s.course_id ? ['course:' + s.course_id] : [])]));
    for (const room of rooms) audience = audience.to(room);
    audience.emit('sessions-batch-deleted', { sessionIds: sessions.map(s => s.id) });
  }
  retryAssetCleanup().catch(() => {});
}
