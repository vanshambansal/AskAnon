import prisma from '../config/prisma.js';
import { generateLectureInsights } from './aiInsightsService.js';
import { invalidateSession } from './classroomEvents.js';

// Shared by background generation, visitors and refresh. Failed refreshes retain the last valid result.
const pending = new Map();
export function lectureInsights(session, refresh = false) {
  if (pending.has(session.id)) return pending.get(session.id);
  if (!refresh && session.ai_summary?.version === 2) return Promise.resolve(session.ai_summary);
  const work = (async () => {
    const [questions, polls] = await Promise.all([
      prisma.question.findMany({ where: { session_id: session.id, status: { notIn: ['FLAGGED', 'DISMISSED'] } }, orderBy: [{ upvotes: 'desc' }, { created_at: 'asc' }] }),
      prisma.poll.findMany({ where: { session_id: session.id }, include: { options: { orderBy: { index: 'asc' } } } })
    ]);
    const result = await generateLectureInsights(session, questions, polls);
    await prisma.session.update({ where: { id: session.id }, data: { ai_summary: result } });
    await invalidateSession(session);
    return result;
  })().finally(() => pending.delete(session.id));
  pending.set(session.id, work);
  return work;
}
