import prisma from '../config/prisma.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { sessionAccess, fail } from '../middleware/accessMiddleware.js';
import { currentPoll, mutatePoll } from '../utils/pollService.js';
import { invalidateSession, workspaceChanged } from '../utils/classroomEvents.js';

export const initSocket = io => {
  io.use(async (socket, next) => {
    try {
      const identity = await authenticateToken(socket.handshake.auth?.token);
      if (!identity.user) fail(401, 'Synchronize your profile before connecting');
      socket.data.clerkUserId = identity.clerkUserId;
      next();
    } catch { next(new Error('Sign in to connect')); }
  });
  io.on('connection', socket => {
    socket.on('error', () => {});
    const on = (event, host, handler) => socket.on(event, async (input, acknowledge) => {
      const done = typeof acknowledge === 'function' ? acknowledge : () => {};
      const code = String(typeof input === 'string' ? input : input?.sessionCode || '').toUpperCase();
      try {
        if (!/^[A-Z0-9]{6}$/.test(code)) fail(400, 'Invalid lecture code');
        const user = await prisma.user.findUnique({ where: { clerk_user_id: socket.data.clerkUserId } });
        if (!user) fail(401, 'Sign in to continue');
        const session = await sessionAccess(user, code, { code: true, write: host });
        if (event !== 'join-session' && !socket.rooms.has(code)) fail(403, 'Join this classroom first');
        const result = await handler(user, session, input);
        done({ ok: true, ...result });
      } catch (err) {
        const message = err.code === 'P2002' ? 'You already voted in this poll' : err.status ? err.message : 'Unable to update the classroom. Please retry.';
        if (event === 'join-session' && [404, 410].includes(err.status)) socket.emit('session-closed', { sessionCode: code, message: 'This lecture is no longer available' });
        socket.emit('operation-error', { message, event });
        done({ ok: false, message });
      }
    });
    on('join-session', false, async (user, session) => {
      await socket.join(session.session_code);
      if (!session.is_active) {
        socket.emit('session-ended', { sessionId: session.id, sessionCode: session.session_code });
        return {};
      }
      const poll = await currentPoll(session.id, user.id);
      socket.emit('session-state', { sessionId: session.id, sessionCode: session.session_code, isPaused: session.is_paused, poll });
      return { poll, isPaused: session.is_paused };
    });
    for (const [event, paused] of [['pause-session', true], ['resume-session', false]]) {
      on(event, true, async (user, session) => {
        const changed = await prisma.session.updateMany({ where: { id: session.id, is_active: true, deletion_job_id: null }, data: { is_paused: paused } });
        if (!changed.count) fail(409, 'This lecture has ended');
        await invalidateSession(session);
        io.to(session.session_code).emit(paused ? 'session-paused' : 'session-resumed', { sessionCode: session.session_code, isPaused: paused });
        workspaceChanged(io, session);
        return { isPaused: paused };
      });
    }
    for (const [event, action, output] of [['start-poll', 'start', 'poll-started'], ['vote-poll', 'vote', 'poll-updated'], ['end-poll', 'end', 'poll-ended'], ['remove-poll', 'remove', 'poll-removed']]) {
      on(event, action !== 'vote', async (user, session, input) => {
        const poll = await mutatePoll(user, session.id, action, action === 'start' ? input.poll : input);
        io.to(session.session_code).emit(output, action === 'remove' ? undefined : poll);
        workspaceChanged(io, session);
        return { poll };
      });
    }
    // Workspace updates are private to the owner and currently enrolled users.
    const refreshWorkspaceRooms = async () => {
      const user = await prisma.user.findUnique({ where: { clerk_user_id: socket.data.clerkUserId } });
      if (!user) return;
      for (const room of socket.rooms) if (room.startsWith('course:')) await socket.leave(room);
      await socket.join('user:' + user.id);
      const enrollments = await prisma.courseEnrollment.findMany({ where: { user_id: user.id }, select: { course_id: true } });
      for (const entry of enrollments) await socket.join('course:' + entry.course_id);
      socket.emit('workspace-ready');
    };
    socket.on('refresh-workspace', () => refreshWorkspaceRooms().catch(() => {}));
    refreshWorkspaceRooms().catch(() => {});
  });
};
