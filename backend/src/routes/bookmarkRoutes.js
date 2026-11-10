import express from 'express';
import {
  toggleBookmark,
  getMyBookmarks,
  getSessionBookmarks
} from '../controllers/bookmarkController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

import { guard, sessionAccess, readQuestion } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);

// Toggle bookmark on/off
router.post('/:questionId/toggle', readQuestion, toggleBookmark);

// Fetch user's saved doubts
router.get('/my', requireAuth, getMyBookmarks);

// Fetch bookmarked question IDs for a specific session
router.get('/session/:sessionId', guard(req => sessionAccess(req.user, req.params.sessionId)), getSessionBookmarks);

export default router;
