import { classroomTransaction } from './transaction.js';
import { assertOwner, fail } from '../middleware/accessMiddleware.js';
import { queueAssets } from './storageLifecycle.js';

export async function deleteLectures(user, ids) {
  return classroomTransaction(async tx => {
    const sessions = await tx.session.findMany({ where: { id: { in: ids } } });
    if (sessions.length !== ids.length) fail(404, 'One or more lectures no longer exist');
    sessions.forEach(s => assertOwner(user, s.teacher_id));
    const questions = await tx.question.findMany({ where: { session_id: { in: ids } }, select: { id: true, image_public_id: true } });
    const qIds = questions.map(q => q.id);
    const media = await tx.sessionMedia.findMany({ where: { session_id: { in: ids } } });
    const polls = await tx.poll.findMany({ where: { session_id: { in: ids } }, select: { id: true } });
    const pIds = polls.map(p => p.id);
    await tx.courseMaterial.updateMany({ where: { session_id: { in: ids } }, data: { session_id: null } });
    if (pIds.length) {
      await tx.pollVote.deleteMany({ where: { poll_id: { in: pIds } } });
      await tx.pollOption.deleteMany({ where: { poll_id: { in: pIds } } });
      await tx.poll.deleteMany({ where: { id: { in: pIds } } });
    }
    if (qIds.length) {
      await tx.bookmark.deleteMany({ where: { question_id: { in: qIds } } });
      await tx.vote.deleteMany({ where: { question_id: { in: qIds } } });
      await tx.question.updateMany({ where: { related_to_id: { in: qIds } }, data: { related_to_id: null, related_text: null } });
      await tx.question.deleteMany({ where: { id: { in: qIds } } });
    }
    if (media.length) await tx.sessionMedia.deleteMany({ where: { session_id: { in: ids } } });
    await tx.session.deleteMany({ where: { id: { in: ids } } });
    await queueAssets([...media, ...questions.map(q => ({ public_id: q.image_public_id }))], 0, tx);
    return sessions;
  });
}

export async function removeCourse(user, courseId) {
  return classroomTransaction(async tx => {
    const course = await tx.course.findUnique({ where: { id: courseId }, include: { enrollments: true, sessions: true, materials: true } });
    if (!course) fail(404, 'Course not found');
    assertOwner(user, course.teacher_id);
    await tx.session.updateMany({ where: { course_id: courseId }, data: { course_id: null } });
    await tx.materialChunk.deleteMany({ where: { material_id: { in: course.materials.map(m => m.id) } } });
    await tx.courseMaterial.deleteMany({ where: { course_id: courseId } });
    await tx.courseEnrollment.deleteMany({ where: { course_id: courseId } });
    await tx.course.delete({ where: { id: courseId } });
    await queueAssets(course.materials, 0, tx);
    return course;
  });
}
