import { queueLectureDeletion, retryLectureDeletion, kickDeletionWorker, deletionJobSelect } from '../utils/sessionDeletionJobs.js';
import { timeOperation } from '../utils/requestTiming.js';
import { sendAIError } from '../utils/geminiClient.js';
import { classroomTransaction } from '../utils/transaction.js';
import { invalidateSession, roomEvent, workspaceChanged } from '../utils/classroomEvents.js';
import { currentPoll } from '../utils/pollService.js';
import { assertOwner, positiveId, fail } from '../middleware/accessMiddleware.js';
import prisma from '../config/prisma.js';
import { getOrSetCache, invalidateCache, invalidateCourseCache } from '../utils/cacheHelper.js';
import { lectureInsights } from '../utils/lectureInsights.js';

const generateSessionCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const createSession = async (req, res) => {
  const { teacher_id, title, subject, course_id } = req.body;

  if (!teacher_id || !title) {
    return res.status(400).json({ error: 'teacher_id and title are required' });
  }

  try {
    // Let PostgreSQL's unique constraint arbitrate the rare code collision.
    // A read-before-insert adds a round trip and still races another creator.
    let session;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        session = await timeOperation(res, 'insert', () => prisma.session.create({
          data: {
            teacher_id: parseInt(teacher_id),
            course_id: course_id ? parseInt(course_id) : null,
            session_code: generateSessionCode(),
            title: title.trim(),
            subject: subject?.trim() || null
          }
        }));
        break;
      } catch (error) {
        if (error.code !== 'P2002' || attempt === 4) throw error;
      }
    }
    // The route already authorized/read this course; reuse its display fields.
    const course = req.assignedCourse;
    session = { ...session, course: course ? { id: course.id, course_code: course.course_code, title: course.title } : null };
    await timeOperation(res, 'invalidate', () => invalidateCache(`cache:sessions:teacher:${teacher_id}`));
    res.status(201).json(session);
    // Aggregate course views refresh after commit without holding room creation.
    // Notify only after their cached responses have been invalidated.
    invalidateCourseCache(session.course_id)
      .then(() => workspaceChanged(req.app.get('io'), session))
      .catch(() => console.warn('Course views could not refresh after lecture creation'));

  } catch (err) {
    console.error('createSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSessionByCode = async (req, res) => {
  const { code } = req.params;
  const cleanCode = code.toUpperCase();

  try {
    const session = await getOrSetCache(`cache:session:code:${cleanCode}`, 900, async () => {
      return prisma.session.findUnique({
        where: { session_code: cleanCode },
        include: {
          course: {
            select: { id: true, course_code: true, title: true }
          }
        }
      });
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);

  } catch (err) {
    console.error('getSessionByCode error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Composite Aggregator / BFF Pattern:
 * Consolidates session metadata, questions, media, materials, and student bookmarks
 * into a single unified parallel payload to eliminate 6-query client waterfalls.
 */
export const getSessionRoomBundle = async (req, res) => {
  const { code } = req.params;
  const cleanCode = code.toUpperCase();
  const userId = req.user.id;

  try {
    // 1. Session lookup via Cache-Aside
    const session = await getOrSetCache(`cache:session:code:${cleanCode}`, 900, async () => {
      return prisma.session.findUnique({
        where: { session_code: cleanCode },
        include: {
          course: {
            select: { id: true, course_code: true, title: true }
          }
        }
      });
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // A verified code join grants the existing course access before the room loads.
    if (session.is_active && session.course_id && session.teacher_id !== req.user.id) {
      const existingEnrollment = await prisma.courseEnrollment.findUnique({ where: { user_id_course_id: { user_id: req.user.id, course_id: session.course_id } } });
      if (!existingEnrollment) {
      await prisma.courseEnrollment.upsert({
        where: { user_id_course_id: { user_id: req.user.id, course_id: session.course_id } },
        create: { user_id: req.user.id, course_id: session.course_id }, update: {}
      });
      await invalidateCache('cache:courses:enrolled:' + req.user.id);
      }
      req.app.get('io')?.in('user:' + req.user.id).socketsJoin('course:' + session.course_id);
    }

    // 2. Fetch classroom data concurrently using PostgreSQL B-Tree indexes
    const [questions, media, materials, bookmarks, votes, poll] = await Promise.all([
      getOrSetCache(`cache:room:questions:${session.id}`, 60, () => prisma.question.findMany({
        where: { session_id: session.id },
        orderBy: [
          { upvotes: 'desc' },
          { created_at: 'asc' }
        ]
      })),
      getOrSetCache(`cache:room:media:${session.id}`, 60, () => prisma.sessionMedia.findMany({
        where: { session_id: session.id },
        orderBy: { uploaded_at: 'desc' }
      })),
      session.course_id
        ? getOrSetCache(`cache:materials:course:${session.course_id}`, 600, () => prisma.courseMaterial.findMany({
            where: {
              OR: [
                { session_id: session.id },
                { course_id: session.course_id }
              ]
            },
            orderBy: { uploaded_at: 'desc' }
          }))
        : getOrSetCache(`cache:materials:session:${session.id}`, 60, () => prisma.courseMaterial.findMany({
            where: { session_id: session.id },
            orderBy: { uploaded_at: 'desc' }
          })),
      userId
        ? prisma.bookmark.findMany({
            where: {
              user_id: userId,
              question: { session_id: session.id }
            },
            select: { question_id: true }
          })
        : Promise.resolve([]),
      prisma.vote.findMany({ where: { user_id: userId, question: { session_id: session.id } }, select: { question_id: true } }),
      req.path.endsWith('/recap-bundle') ? prisma.poll.findMany({ where: { session_id: session.id }, include: { options: { orderBy: { index: 'asc' } } }, orderBy: { created_at: 'asc' } }) : currentPoll(session.id, userId)
    ]);

    const bookmarkedIds = bookmarks.map(b => b.question_id);

    res.json({
      session,
      questions: session.teacher_id === req.user.id ? questions : questions.filter(question => !['FLAGGED', 'DISMISSED'].includes(question.status)),
      media,
      materials,
      bookmarkedIds,
      votedIds: votes.map(v => v.question_id),
      ...(req.path.endsWith('/recap-bundle') ? { polls: poll } : { poll })
    });

  } catch (err) {
    console.error('getSessionRoomBundle error:', err.message);
    res.status(500).json({ error: 'Failed to load classroom bundle' });
  }
};

export const endSession = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  const sessionId = parseInt(id);

  try {
    const { existing, session } = await classroomTransaction(async tx => {
      const existing = await tx.session.findUnique({ where: { id: sessionId } });
      if (!existing) fail(404, 'Session not found');
      assertOwner(req.user, existing.teacher_id);
      if (existing.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      const session = await tx.session.update({ where: { id: sessionId }, data: { is_active: false, is_paused: false, ended_at: existing.ended_at || new Date() } });
      await tx.poll.updateMany({ where: { session_id: sessionId, is_active: true }, data: { is_active: false, ended_at: new Date() } });
      return { existing, session };
    });
    await invalidateSession(session);
    roomEvent(req.app.get('io'), session, 'session-ended', { sessionId: session.id, sessionCode: session.session_code, message: 'The lecture has ended.' });
    res.json({ message: 'Session ended', session });

    if (existing.is_active && process.env.GEMINI_API_KEY) {
      setImmediate(() => lectureInsights(session).catch(err => console.warn('Background recap unavailable:', err.status || err.code || err.name)));
    }

  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Session not found' });
    }
    console.error('endSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSessionsByTeacher = async (req, res) => {
  const { teacherId } = req.params;
  const tId = parseInt(teacherId);

  try {
    const sessions = await getOrSetCache(`cache:sessions:teacher:${tId}`, 300, async () => {
      return prisma.session.findMany({
        where: { teacher_id: tId },
        include: {
          deletionJob: { select: deletionJobSelect },
          course: {
            select: { id: true, course_code: true, title: true }
          },
          questions: {
            select: {
              id: true,
              session_id: true,
              content_type: true,
              code_snippet: true,
              code_language: true,
              question_text: true,
              upvotes: true,
              is_answered: true,
              status: true,
              image_url: true,
              created_at: true
            }
          },
          _count: {
            select: { questions: true }
          }
        },
        orderBy: { started_at: 'desc' }
      });
    });

    res.json(sessions);
  } catch (err) {
    console.error('getSessionsByTeacher error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getActiveSessions = async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { deletion_job_id: null, is_active: true, OR: [{ teacher_id: req.user.id }, { course: { enrollments: { some: { user_id: req.user.id } } } }] },
      include: {
        course: {
          select: { id: true, course_code: true, title: true }
        },
        _count: {
          select: { questions: true }
        }
      },
      orderBy: { started_at: 'desc' },
      take: 10
    });
    res.json(sessions);
  } catch (err) {
    console.error('getActiveSessions error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getActiveSessionsForStudent = async (req, res) => {
  try {
    const { userId } = req.params;
    const studentId = parseInt(userId);

    // Fetch active sessions belonging to courses the student is enrolled in with a single SQL query
    const sessions = await prisma.session.findMany({
      where: {
        deletion_job_id: null,
        is_active: true,
        course: {
          enrollments: {
            some: { user_id: studentId }
          }
        }
      },
      include: {
        course: {
          select: { id: true, course_code: true, title: true }
        },
        _count: {
          select: { questions: true }
        }
      },
      orderBy: { started_at: 'desc' }
    });

    res.json(sessions);
  } catch (err) {
    console.error('getActiveSessionsForStudent error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getStudentSessionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const studentId = parseInt(userId);

    // Fetch concluded sessions belonging to courses the student is enrolled in
    const sessions = await getOrSetCache(`cache:sessions:history:student:${studentId}`, 300, async () => {
      return prisma.session.findMany({
        where: {
          deletion_job_id: null,
          is_active: false,
          course: {
            enrollments: {
              some: { user_id: studentId }
            }
          }
        },
        include: {
          course: {
            select: { id: true, course_code: true, title: true }
          },
          teacher: {
            select: { id: true, name: true }
          },
          _count: {
            select: { questions: true }
          }
        },
        orderBy: { started_at: 'desc' }
      });
    });

    res.json(sessions);
  } catch (err) {
    console.error('getStudentSessionHistory error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSession = async (req, res, next) => {
  try {
    const result = await timeOperation(res, 'queue', () => queueLectureDeletion(req.user, [positiveId(req.params.id)]));
    res.status(202).json({ message: 'Lecture deletion queued', ...result });
    kickDeletionWorker(req.app.get('io'), result.sessions);
  } catch (err) { next(err); }
};

export const retrySessionDeletion = async (req, res, next) => {
  try {
    const sessions = await retryLectureDeletion(req.user, req.params.jobId);
    res.status(202).json({ message: 'Deletion will resume' });
    kickDeletionWorker(req.app.get('io'), sessions);
  } catch (err) { next(err); }
};

export const updateSessionCourse = async (req, res, next) => {
  try {
    const { previous, session } = await classroomTransaction(async tx => {
      const previous = await tx.session.findUnique({ where: { id: positiveId(req.params.id) } });
      if (!previous) fail(404, 'Session not found');
      assertOwner(req.user, previous.teacher_id);
      if (previous.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      if (req.body.course_id) {
        const course = await tx.course.findUnique({ where: { id: positiveId(req.body.course_id) } });
        if (!course) fail(404, 'Course not found');
        assertOwner(req.user, course.teacher_id);
      }
      const session = await tx.session.update({ where: { id: previous.id }, data: { course_id: req.body.course_id ? positiveId(req.body.course_id) : null }, include: { course: { select: { id: true, course_code: true, title: true } } } });
      // Existing vault resources remain in their original course; only the lecture is reassigned.
      await tx.courseMaterial.updateMany({ where: { session_id: session.id, ...(session.course_id ? { course_id: { not: session.course_id } } : {}) }, data: { session_id: null } });
      return { previous, session };
    });
    await invalidateSession(previous); await invalidateSession(session);
    workspaceChanged(req.app.get('io'), previous);
    roomEvent(req.app.get('io'), session, 'session-updated', session);
    res.json(session);
  } catch (err) { next(err); }
};

export const batchDeleteSessions = async (req, res, next) => {
  try {
    const ids = [...new Set(req.body.sessionIds.map(positiveId))];
    if (!ids.length) fail(400, 'Select lectures to delete');
    const result = await timeOperation(res, 'queue', () => queueLectureDeletion(req.user, ids, true));
    res.status(202).json({ message: 'Lecture deletions queued', ...result });
    kickDeletionWorker(req.app.get('io'), result.sessions);
  } catch (err) { next(err); }
};

export const getSessionPolls = async (req, res) => {
  try {
    const { code } = req.params;
    const session = await prisma.session.findUnique({
      where: { session_code: code },
      select: { id: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const polls = await prisma.poll.findMany({
      where: { session_id: session.id },
      include: {
        options: {
          orderBy: { index: 'asc' }
        }
      },
      orderBy: { created_at: 'asc' }
    });

    res.json(polls);
  } catch (err) {
    console.error('getSessionPolls error:', err.message);
    res.status(500).json({ error: 'Failed to fetch session polls' });
  }
};

/**
 * GET /api/sessions/:id/ai-insights
 * Returns the synthesized lecture insights (core concepts, confusion heatmap, exam notes, instructor review).
 * Reads from PostgreSQL cache first; synthesizes on-demand if null.
 */
const serveInsights = refresh => async (req, res) => {
  try {
    const id = req.params.id;
    const session = await prisma.session.findFirst({
      where: /^\d+$/.test(id) ? { id: Number(id) } : { session_code: id.toUpperCase() },
      include: { course: { select: { title: true, course_code: true } } }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.is_active) return res.status(409).json({ error: 'End the lecture before generating its recap.' });
    res.json(await lectureInsights(session, refresh));
  } catch (err) {
    console.warn('Lecture insights unavailable:', err.status || err.code || err.name);
    sendAIError(res, err);
  }
};
export const getAILectureInsights = serveInsights(false);
export const refreshAILectureInsights = serveInsights(true);
