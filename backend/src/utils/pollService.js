import prisma from '../config/prisma.js';
import { classroomTransaction } from './transaction.js';
import { assertOwner, positiveId, fail } from '../middleware/accessMiddleware.js';

export function pollView(poll, userId) {
  if (!poll) return null;
  const options = [...poll.options].sort((a, b) => a.index - b.index);
  const myVote = poll.votes?.find(v => v.voter_key === `user_${userId}`);
  return { id: poll.id, question: poll.question, options: options.map(o => ({ id: o.id, text: o.text, votes: o.votes })), totalVotes: options.reduce((sum, o) => sum + o.votes, 0), active: poll.is_active, ...(userId ? { myVote: myVote ? options.findIndex(o => o.id === myVote.option_id) : null } : {}) };
}
export async function currentPoll(sessionId, userId) {
  const poll = await prisma.poll.findFirst({ where: { session_id: sessionId, is_visible: true }, orderBy: { created_at: 'desc' }, include: { options: true, votes: { where: { voter_key: `user_${userId}` } } } });
  return pollView(poll, userId);
}
export async function mutatePoll(user, sessionId, action, input = {}) {
  return classroomTransaction(async tx => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session?.is_active || session.deletion_job_id) fail(409, 'This lecture has ended');
    if (action !== 'vote') assertOwner(user, session.teacher_id);
    if (action === 'start') {
      const question = typeof input.question === 'string' ? input.question.trim() : '';
      const options = Array.isArray(input.options) ? input.options.map(o => (typeof o === 'string' ? o : o.text)?.trim()) : [];
      if (!question || question.length > 300 || options.length < 2 || options.length > 6 || options.some(o => !o || o.length > 200)) fail(400, 'Enter a poll question and 2–6 options');
      await tx.poll.updateMany({ where: { session_id: sessionId, is_visible: true }, data: { is_active: false, is_visible: false, ended_at: new Date() } });
      const poll = await tx.poll.create({ data: { session_id: sessionId, question, options: { create: options.map((text, index) => ({ text, index })) } }, include: { options: true } });
      return pollView(poll);
    }
    const poll = await tx.poll.findFirst({ where: { session_id: sessionId, is_visible: true }, orderBy: { created_at: 'desc' }, include: { options: true } });
    if (!poll) fail(404, 'No poll is displayed');
    if (action === 'vote') {
      if (!poll.is_active || poll.id !== positiveId(input.pollId)) fail(409, 'This poll is no longer open');
      if (user.id === session.teacher_id && user.role === 'teacher') fail(403, 'Hosts cannot vote in their own poll');
      const index = Number(input.optionIndex);
      const option = poll.options.find(o => o.index === index);
      if (!Number.isInteger(index) || !option) fail(400, 'Choose a valid poll option');
      await tx.pollVote.create({ data: { poll_id: poll.id, option_id: option.id, user_id: user.id, voter_key: `user_${user.id}` } });
      await tx.pollOption.update({ where: { id: option.id }, data: { votes: { increment: 1 } } });
      return pollView(await tx.poll.findUnique({ where: { id: poll.id }, include: { options: true } }));
    }
    return pollView(await tx.poll.update({ where: { id: poll.id }, data: { is_active: false, ended_at: poll.ended_at || new Date(), ...(action === 'remove' ? { is_visible: false } : {}) }, include: { options: true } }));
  });
}
