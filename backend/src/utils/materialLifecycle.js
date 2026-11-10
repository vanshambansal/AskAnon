import { randomUUID } from 'node:crypto';
import { assertOwner } from '../middleware/accessMiddleware.js';
import { invalidateCourseCache } from './cacheHelper.js';
import { invalidateSession, workspaceChanged } from './classroomEvents.js';

export async function resolveLectureCourse(tx, session, user) {
  assertOwner(user, session.teacher_id);
  if (session.course_id) return tx.course.findUnique({ where: { id: session.course_id } });
  let course = await tx.course.findFirst({ where: { teacher_id: user.id, OR: [{ course_code: { startsWith: 'GEN-' } }, { course_code: 'GEN100' }], title: 'General Lectures & Sessions' }, orderBy: { created_at: 'asc' } });
  if (!course) course = await tx.course.create({ data: { teacher_id: user.id, course_code: 'GEN-' + randomUUID().slice(0, 8).toUpperCase(), title: 'General Lectures & Sessions' } });
  await tx.session.update({ where: { id: session.id }, data: { course_id: course.id } });
  return course;
}

export async function materialChanged(io, course, session, event, payload) {
  await invalidateCourseCache(course.id);
  if (session) await invalidateSession(session);
  let audience = io?.to('user:' + course.teacher_id).to('course:' + course.id);
  if (session) audience = audience?.to(session.session_code);
  audience?.emit(event, payload);
  workspaceChanged(io, { id: session?.id, session_code: session?.session_code, teacher_id: course.teacher_id, course_id: course.id });
  if (session) io?.to(session.session_code).emit('session-updated', { id: session.id, session_code: session.session_code });
}
