import { aiLimit, uploadLimit, indexLimit } from '../middleware/serviceLimits.js';
import express from 'express';
import {
  uploadMaterial,
  getMaterialsByCourse,
  getMaterialsBySession,
  deleteMaterial,
  saveMediaToVault,
  proxyDownload,
  askMaterial,
  retryMaterialIndex
} from '../controllers/materialController.js';
import { materialUpload } from '../config/cloudinary.js';
import { requireAuth, requireTeacher } from '../middleware/authMiddleware.js';

import prisma from '../config/prisma.js';
import { guard, courseAccess, sessionAccess, materialAccess, fail } from '../middleware/accessMiddleware.js';
const router = express.Router();
router.use(requireAuth);

// Direct browser proxy download for Cloudinary PDFs and media
router.get('/proxy-download', proxyDownload);

// Upload a PDF/slide/handout
router.post('/upload', requireTeacher, uploadLimit, materialUpload.single('file'), uploadMaterial);

// Save in-class media into course materials vault
router.post('/from-media', requireTeacher, guard(async req => {
  const session = await sessionAccess(req.user, req.body.session_id, { write: true });
  const ref = String(req.body.media_id || '');
  const media = await prisma.sessionMedia.findFirst({ where: { session_id: session.id, OR: [
    ...(Number.isSafeInteger(Number(ref)) && Number(ref) > 0 ? [{ id: Number(ref) }] : []), { public_id: ref }
  ] } });
  if (!media) fail(404, 'Media not found in this lecture');
}), saveMediaToVault);

// Fetch materials
router.get('/course/:courseId', guard(req => courseAccess(req.user, req.params.courseId)), getMaterialsByCourse);
router.get('/session/:sessionId', guard(req => sessionAccess(req.user, req.params.sessionId)), getMaterialsBySession);

// Delete a material
router.delete('/:id', requireTeacher, guard(req => materialAccess(req.user, req.params.id, true)), deleteMaterial);

router.post('/:id/index', requireTeacher, guard(req => materialAccess(req.user, req.params.id, true)), indexLimit, retryMaterialIndex);

// Ask question about material (RAG)
router.post('/:id/ask', guard(req => materialAccess(req.user, req.params.id)), aiLimit, askMaterial);

export default router;
