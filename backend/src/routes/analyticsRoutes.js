import express from "express";
import { getTeacherAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/teacher/:teacherId", getTeacherAnalytics);

export default router;