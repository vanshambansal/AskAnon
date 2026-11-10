import prisma from '../config/prisma.js';

// Code-based access for standalone lectures, without adding an attendance model.
// Opening the code URL re-establishes access after a backend restart.
const lectureGrants = new Map();

export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'Invalid resource ID');
  return id;
}
export const guard = fn => async (req, res, next) => {
  try { await fn(req); next(); } catch (err) { next(err); }
};
export function assertOwner(user, ownerId) {
  if (!user || user.role !== 'teacher' || user.id !== ownerId) fail(403, 'Only the owner can manage this resource');
}
export async function courseAccess(user, value, write = false) {
  const course = await prisma.course.findUnique({ where: { id: positiveId(value) }, ...(!write ? { include: { _count: { select: { enrollments: { where: { user_id: user.id } } } } } } : {}) });
  if (!course) fail(404, 'Course not found');
  if (write) assertOwner(user, course.teacher_id);
  else if (user.id !== course.teacher_id) {
    const enrollment = course._count?.enrollments !== undefined ? course._count.enrollments > 0 : await prisma.courseEnrollment.findUnique({
      where: { user_id_course_id: { user_id: user.id, course_id: course.id } }
    });
    if (!enrollment) fail(403, 'Join a lecture in this course to access its resources');
  }
  return course;
}
// A valid lecture code remains the existing signed-in joining mechanism.
export async function sessionAccess(user, value, { write = false, code = false } = {}) {
  const where = code ? { session_code: String(value).trim().toUpperCase() } : { id: positiveId(value) };
  const session = await prisma.session.findUnique({ where });
  if (!session) fail(404, 'Session not found');
  if (session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
  if (write) assertOwner(user, session.teacher_id);
  else if (code) {
    if (lectureGrants.size >= 10000) lectureGrants.delete(lectureGrants.keys().next().value);
    lectureGrants.set(`${user.id}:${session.id}`, Date.now() + 12 * 60 * 60 * 1000);
  } else if (session.teacher_id !== user.id) {
    if (session.course_id) {
      // The session already provides the course ID. Avoid re-reading the course first.
      const enrollment = await prisma.courseEnrollment.findUnique({ where: { user_id_course_id: { user_id: user.id, course_id: session.course_id } } });
      if (!enrollment) fail(403, 'Join a lecture in this course to access its resources');
    }
    else if ((lectureGrants.get(`${user.id}:${session.id}`) || 0) <= Date.now()) fail(403, 'Open this lecture using its room code first');
  }
  return session;
}
export async function questionAccess(user, id, write = false) {
  const question = await prisma.question.findUnique({ where: { id: positiveId(id) }, ...(write ? { include: { session: true } } : {}) });
  if (!question) fail(404, 'Question not found');
  const session = write && question.session ? question.session : await sessionAccess(user, question.session_id, { write });
  if (write) assertOwner(user, session.teacher_id);
  if (!write && session.teacher_id !== user.id && ['FLAGGED', 'DISMISSED'].includes(question.status)) fail(404, 'Question is not available in the class feed');
  return question;
}
export async function materialAccess(user, id, write = false) {
  const material = await prisma.courseMaterial.findUnique({ where: { id: positiveId(id) } });
  if (!material) fail(404, 'Material not found');
  await courseAccess(user, material.course_id, write);
  return material;
}
export const ownUser = param => guard(req => {
  if (positiveId(req.params[param]) !== req.user.id) fail(403, 'You can only access your own dashboard');
});
export const ownSession = param => guard(req => sessionAccess(req.user, req.params[param], { write: true }));
export const ownQuestion = guard(req => questionAccess(req.user, req.params.id, true));
export const readQuestion = guard(req => questionAccess(req.user, req.params.id || req.params.questionId));
