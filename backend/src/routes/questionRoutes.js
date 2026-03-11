import express from 'express';
import {
  createQuestion,
  getQuestions,
  markAnswered,
  deleteQuestion,
  upvoteQuestion
} from '../controllers/questionController.js';
import { requireAuth, requireTeacher, rateLimiter } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', requireAuth, rateLimiter, createQuestion);
router.get('/:sessionId', requireAuth, getQuestions);
router.patch('/:id/answer',  markAnswered);
router.delete('/:id',  deleteQuestion);
router.post('/:id/upvote', requireAuth, upvoteQuestion);

export default router;