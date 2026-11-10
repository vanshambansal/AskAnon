import { duplicateLimit } from '../middleware/serviceLimits.js';
import express from 'express';
import {
  createQuestion,
  getQuestions,
  markAnswered,
  updateQuestionStatus,
  deleteQuestion,
  upvoteQuestion,
  answerQuestionWithText,
  checkDuplicateQuestion
} from '../controllers/questionController.js';
import { requireAuth, requireTeacher, rateLimiter } from '../middleware/authMiddleware.js';

import { guard, sessionAccess, fail, readQuestion } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);
const readBodySession = guard(async req => {
  const session = await sessionAccess(req.user, req.body.session_id);
  req.classroom = session;
  if (req.path === '/' && (!session.is_active || (session.is_paused && session.teacher_id !== req.user.id))) fail(409, session.is_active ? 'Question intake is paused by the professor' : 'This lecture has ended');
});

router.post('/check-duplicate', readBodySession, duplicateLimit, checkDuplicateQuestion);
router.post('/', readBodySession, (req, res, next) => req.body.content_type && req.body.content_type !== 'QUESTION' && req.user.role === 'teacher' ? next() : rateLimiter(req, res, next), createQuestion);
router.get('/:sessionId', guard(async req => { req.classroom = await sessionAccess(req.user, req.params.sessionId); }), getQuestions);
// These controllers verify ownership inside the write transaction. Re-reading it
// here adds round trips without protecting the transaction from concurrent changes.
router.patch('/:id/answer', requireTeacher, markAnswered);
router.patch('/:id/answer-text', requireTeacher, answerQuestionWithText);
router.patch('/:id/status', requireTeacher, updateQuestionStatus);
router.delete('/:id', requireTeacher, deleteQuestion);
router.post('/:id/upvote', readQuestion, upvoteQuestion);

export default router;
