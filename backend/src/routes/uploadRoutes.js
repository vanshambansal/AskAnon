import { uploadLimit } from '../middleware/serviceLimits.js';
import express from 'express';
import prisma from '../config/prisma.js';
import { uploadQuestionImage, uploadSessionMedia, getSessionMedia, deleteMedia } from '../controllers/uploadController.js';
import { upload } from '../config/cloudinary.js';
import { requireAuth, requireTeacher } from '../middleware/authMiddleware.js';
import { guard, ownSession, sessionAccess, fail } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);
router.post('/question', uploadLimit, upload.single('image'), uploadQuestionImage);
router.post('/session/:sessionId/media', requireTeacher, ownSession('sessionId'), uploadLimit, upload.single('image'), uploadSessionMedia);
router.get('/session/:sessionId/media', guard(req => sessionAccess(req.user, req.params.sessionId)), getSessionMedia);
router.delete('/media/:publicId', requireTeacher, guard(async req => {
  const media = await prisma.sessionMedia.findFirst({ where: { public_id: req.params.publicId } });
  if (!media) fail(404, 'Media not found');
  await sessionAccess(req.user, media.session_id, { write: true });
}), deleteMedia);
export default router;
