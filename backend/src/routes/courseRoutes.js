import { aiLimit } from '../middleware/serviceLimits.js';
import express from 'express';
import { requireAuth, requireTeacher } from '../middleware/authMiddleware.js';
import {
  createCourse,
  getCoursesByTeacher,
  getCourseById,
  getAllCourses,
  deleteCourse,
  getEnrolledCourses,
  enrollStudent,
  unenrollStudent,
  askCourse
} from '../controllers/courseController.js';

import { guard, courseAccess, ownUser, fail } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);
const readCourse = guard(req => courseAccess(req.user, req.params.id));
const writeCourse = guard(req => courseAccess(req.user, req.params.id, true));

router.get('/', getAllCourses);
router.post('/', requireTeacher, guard(req => {
  if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 200) fail(400, 'Enter a course title of 1?200 characters');
  if (typeof req.body.course_code !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(req.body.course_code.trim())) fail(400, 'Use a course code of up to 50 letters, numbers, hyphens or underscores');
}), createCourse);
router.get('/teacher/:teacherId', requireTeacher, ownUser('teacherId'), getCoursesByTeacher);

// Enrollment routes (must precede /:id)
router.get('/enrolled/:userId', ownUser('userId'), getEnrolledCourses);
router.post('/enroll', enrollStudent);
router.delete('/enroll/:courseId', unenrollStudent);

router.get('/:id', readCourse, getCourseById);
router.delete('/:id', requireTeacher, writeCourse, deleteCourse);

// Course-wide AI Assistant RAG
router.post('/:id/ask', readCourse, aiLimit, askCourse);


export default router;
