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

router.post('/', requireAuth, rateLimiter, createQuestion);           // any logged in user
router.get('/:sessionId', requireAuth, getQuestions);                 // any logged in user
router.patch('/:id/answer',  markAnswered); // teachers only
router.delete('/:id',  deleteQuestion);     // teachers only
router.post('/:id/upvote', requireAuth, upvoteQuestion);              // any logged in user

export default router;