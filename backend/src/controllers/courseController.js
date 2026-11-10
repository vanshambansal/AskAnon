import { sendAIError } from '../utils/geminiClient.js';
import { removeCourse } from '../utils/sessionLifecycle.js';
import { invalidateSession, workspaceChanged } from '../utils/classroomEvents.js';
import { retryAssetCleanup } from '../utils/storageLifecycle.js';
import { sessionAccess, fail } from '../middleware/accessMiddleware.js';
import prisma from '../config/prisma.js';
import { cloudinary } from '../config/cloudinary.js';
import { getOrSetCache, invalidateCache } from '../utils/cacheHelper.js';

// POST /api/courses
// Create a new course
export const createCourse = async (req, res) => {
  try {
    const { course_code, title, description, teacher_id } = req.body;

    if (!course_code || !title || !teacher_id) {
      return res.status(400).json({ error: 'course_code, title, and teacher_id are required' });
    }

    const cleanCode = course_code.trim().toUpperCase();

    const created = await prisma.course.create({
      data: {
        course_code: cleanCode,
        title: title.trim(),
        description: description?.trim() || null,
        teacher_id: parseInt(teacher_id)
      }
    });
    const course = { ...created, _count: { sessions: 0, materials: 0 } };

    // Invalidate teacher's cached courses
    await invalidateCache(`cache:courses:teacher:${teacher_id}`);

    res.status(201).json(course);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This course code already exists' });
    console.error('createCourse error:', err.message);
    res.status(500).json({ error: 'Failed to create course' });
  }
};

// GET /api/courses/teacher/:teacherId
// Fetch all courses for a teacher with session and material counts
export const getCoursesByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const tId = parseInt(teacherId);

    const courses = await getOrSetCache(`cache:courses:teacher:${tId}`, 600, async () => {
      return prisma.course.findMany({
        where: { teacher_id: tId },
        include: {
          _count: {
            select: {
              sessions: { where: { deletion_job_id: null } },
              materials: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      });
    });

    res.json(courses);
  } catch (err) {
    console.error('getCoursesByTeacher error:', err.message);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

// GET /api/courses/:id
// Get course details with all sessions and materials
export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const cId = parseInt(id);

    const course = await getOrSetCache(`cache:courses:details:${cId}`, 600, async () => {
      return prisma.course.findUnique({
        where: { id: cId },
        include: {
          sessions: {
            where: { deletion_job_id: null },
            orderBy: { started_at: 'desc' },
            include: {
              _count: {
                select: { questions: true }
              }
            }
          },
          materials: {
            orderBy: { uploaded_at: 'desc' }
          },
          teacher: {
            select: { id: true, name: true, email: true }
          }
        }
      });
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (err) {
    console.error('getCourseById error:', err.message);
    res.status(500).json({ error: 'Failed to fetch course details' });
  }
};

// GET /api/courses
// Fetch all public courses with materials and session count
export const getAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { OR: [{ teacher_id: req.user.id }, { enrollments: { some: { user_id: req.user.id } } }] },
      include: {
        _count: {
          select: {
            sessions: { where: { deletion_job_id: null } },
            materials: true
          }
        },
        teacher: {
          select: { id: true, name: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(courses);
  } catch (err) {
    console.error('getAllCourses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

// DELETE /api/courses/:id
// Delete a course (requires all sessions unlinked or deleted)
export const deleteCourse = async (req, res, next) => {
  try {
    const course = await removeCourse(req.user, Number(req.params.id));
    await invalidateCache('cache:courses:teacher:' + course.teacher_id, 'cache:courses:details:' + course.id, 'cache:materials:course:' + course.id, ...course.enrollments.flatMap(e => ['cache:courses:enrolled:' + e.user_id, 'cache:sessions:history:student:' + e.user_id]));
    for (const session of course.sessions) {
      await invalidateSession(session);
      req.app.get('io')?.to(session.session_code).emit('session-updated', { id: session.id, session_code: session.session_code });
    }
    req.app.get('io')?.to('user:' + course.teacher_id).to('course:' + course.id).emit('course-deleted', { courseId: course.id });
    workspaceChanged(req.app.get('io'), { teacher_id: course.teacher_id, course_id: course.id });
    retryAssetCleanup().catch(() => {});
    res.json({ message: 'Course deleted; lectures retained without a course' });
  } catch (err) { next(err); }
};

// GET /api/courses/enrolled/:userId
// Fetch all courses a student is enrolled in
export const getEnrolledCourses = async (req, res) => {
  try {
    const { userId } = req.params;
    const studentId = parseInt(userId);

    const courses = await getOrSetCache(`cache:courses:enrolled:${studentId}`, 600, async () => {
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { user_id: studentId },
        include: {
          course: {
            include: {
              _count: {
                select: {
                  sessions: { where: { deletion_job_id: null } },
                  materials: true
                }
              },
              teacher: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
        orderBy: { joined_at: 'desc' }
      });

      return enrollments.map(e => ({
        ...e.course,
        enrolled_at: e.joined_at
      }));
    });

    res.json(courses);
  } catch (err) {
    console.error('getEnrolledCourses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch enrolled courses' });
  }
};

// POST /api/courses/enroll
// Auto-enrolls student into course via course_id
export const enrollStudent = async (req, res) => {
  try {
    const { course_id, session_code } = req.body;
    const user_id = req.user.id;
    const joined = await sessionAccess(req.user, session_code, { code: true });
    if (!joined.is_active || joined.course_id !== Number(course_id)) fail(403, 'Join an active lecture in this course to enroll');

    if (!user_id || !course_id) {
      return res.status(400).json({ error: 'user_id and course_id are required' });
    }

    const userId = parseInt(user_id);
    const courseId = parseInt(course_id);

    // Verify course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, course_code: true, title: true, teacher_id: true }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Do not enroll teacher into their own course as a student
    if (course.teacher_id === userId) {
      return res.json({ message: 'User is teacher of this course', course });
    }

    const enrollment = await prisma.courseEnrollment.upsert({
      where: {
        user_id_course_id: {
          user_id: userId,
          course_id: courseId
        }
      },
      update: {},
      create: {
        user_id: userId,
        course_id: courseId
      }
    });

    // Invalidate student enrolled courses cache
    await invalidateCache(`cache:courses:enrolled:${userId}`, `cache:sessions:history:student:${userId}`);
    req.app.get('io')?.in('user:' + userId).socketsJoin('course:' + courseId);
    req.app.get('io')?.to('user:' + userId).emit('workspace-updated', { courseId });

    res.status(200).json({ message: 'Enrolled successfully', enrollment, course });
  } catch (err) {
    console.error('enrollStudent error:', err.message);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
};

// DELETE /api/courses/enroll/:courseId
// Allows student to leave a course
export const unenrollStudent = async (req, res) => {
  try {
    const { courseId } = req.params;
    const user_id = req.user.id;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id query param is required' });
    }

    const uId = parseInt(user_id);

    await prisma.courseEnrollment.deleteMany({
      where: {
        user_id: uId,
        course_id: parseInt(courseId)
      }
    });

    // Invalidate student enrolled courses cache
    await invalidateCache(`cache:courses:enrolled:${uId}`, `cache:sessions:history:student:${uId}`);
    req.app.get('io')?.in('user:' + uId).socketsLeave('course:' + courseId);
    req.app.get('io')?.to('user:' + uId).emit('workspace-updated', { courseId: Number(courseId) });

    res.json({ message: 'Successfully left course' });
  } catch (err) {
    console.error('unenrollStudent error:', err.message);
    res.status(500).json({ error: 'Failed to leave course' });
  }
};

// POST /api/courses/:id/ask
// Chat with the entire course vault across all uploaded materials using RAG
export const askCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { question } = req.body;

    if (typeof question !== 'string' || !question.trim() || question.length > 2000) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const { askCourseRag } = await import('../utils/ragService.js');
    const result = await askCourseRag(id, question.trim(), req.body.mode || 'ask', req.body.history || []);

    res.json(result);
  } catch (err) {
    console.error('askCourse error:', err.message);
    sendAIError(res, err);
  }
};
