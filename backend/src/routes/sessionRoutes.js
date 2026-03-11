import express from 'express';
import {
  createSession,
  getSessionByCode,
  endSession,
  getSessionsByTeacher,
  deleteSession
} from '../controllers/sessionController.js';

const router = express.Router();

router.post('/',                   createSession);
router.get('/teacher/:teacherId',  getSessionsByTeacher);
router.get('/:code',               getSessionByCode);
router.patch('/:id/end',           endSession);
router.delete('/:id',              deleteSession);

export default router;