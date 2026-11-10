import express from "express";
import { getTeacherAnalytics } from "../controllers/analyticsController.js";

import { requireAuth, requireTeacher } from '../middleware/authMiddleware.js';
import { ownUser } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth, requireTeacher);

router.get("/teacher/:teacherId", ownUser('teacherId'), getTeacherAnalytics);

export default router;
