import { aiLimit } from '../middleware/serviceLimits.js';
import express from 'express';
import {
  createSession,
  getSessionByCode,
  getSessionRoomBundle,
  endSession,
  getSessionsByTeacher,
  getActiveSessions,
  getActiveSessionsForStudent,
  deleteSession,
  retrySessionDeletion,
  updateSessionCourse,
  batchDeleteSessions,
  getSessionPolls,
  getStudentSessionHistory,
  getAILectureInsights,
  refreshAILectureInsights
} from '../controllers/sessionController.js';

import { requireAuth, requireTeacher } from '../middleware/authMiddleware.js';
import { guard, ownUser, ownSession, courseAccess, sessionAccess, positiveId, fail } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);
router.param('code', (req, res, next, code) => {
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-character lecture code' });
  req.params.code = code.toUpperCase(); next();
});
const sessionForm = guard(req => {
  if (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 200) fail(400, 'Enter a lecture title of 1?200 characters');
  if (req.body.subject != null && (typeof req.body.subject !== 'string' || req.body.subject.length > 200)) fail(400, 'Subject must be at most 200 characters');
});
const assignedCourse = guard(async req => { if (req.body.course_id) req.assignedCourse = await courseAccess(req.user, req.body.course_id, true); });
const insightAccess = guard(req => sessionAccess(req.user, req.params.id, { code: !/^\d+$/.test(req.params.id) }));
const insightOwner = guard(req => sessionAccess(req.user, req.params.id, { code: !/^\d+$/.test(req.params.id), write: true }));
const readCode = guard(req => sessionAccess(req.user, req.params.code, { code: true }));
const batchOwner = guard(async req => {
  if (!Array.isArray(req.body.sessionIds) || !req.body.sessionIds.length) fail(400, 'Select sessions to delete');
  const ids = [...new Set(req.body.sessionIds.map(positiveId))];
  // Ownership and existence are checked before pruning inside deleteLectures'
  // transaction. Avoid an identical remote read outside that transaction.
  req.body.sessionIds = ids;
});

router.post('/', requireTeacher, sessionForm, assignedCourse, createSession);
router.post('/deletion-jobs/:jobId/retry', requireTeacher, retrySessionDeletion);
router.post('/batch-delete', requireTeacher, batchOwner, batchDeleteSessions);
router.get('/active/public',          getActiveSessions);
router.get('/active/student/:userId', ownUser('userId'), getActiveSessionsForStudent);
router.get('/history/student/:userId', ownUser('userId'), getStudentSessionHistory);
router.get('/teacher/:teacherId',     requireTeacher, ownUser('teacherId'), getSessionsByTeacher);
router.get('/:code/polls', readCode, getSessionPolls);
router.get('/:code/recap-bundle', readCode, getSessionRoomBundle);
router.get('/:code/bundle', readCode, getSessionRoomBundle);
router.get('/:code', readCode, getSessionByCode);
router.get('/:id/ai-insights',         insightAccess, aiLimit, getAILectureInsights);
router.post('/:id/ai-insights/refresh', requireTeacher, insightOwner, aiLimit, refreshAILectureInsights);
router.patch('/:id/end',           requireTeacher, ownSession('id'), endSession);
router.patch('/:id/course',        requireTeacher, ownSession('id'), assignedCourse, updateSessionCourse);
router.delete('/:id',              requireTeacher, deleteSession);

export default router;
