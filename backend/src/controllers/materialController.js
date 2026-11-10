import { sendAIError } from '../utils/geminiClient.js';
import { classroomTransaction } from '../utils/transaction.js';
import { resolveLectureCourse, materialChanged } from '../utils/materialLifecycle.js';
import { assertOwner, positiveId } from '../middleware/accessMiddleware.js';
import { queueAsset, retryAssetCleanup } from '../utils/storageLifecycle.js';
import { courseAccess, sessionAccess, fail } from '../middleware/accessMiddleware.js';
import prisma from '../config/prisma.js';
import cloudinary from '../config/cloudinary.js';
import { getOrSetCache, invalidateCache, invalidateCourseCache } from '../utils/cacheHelper.js';
import { processAndEmbedMaterial } from '../utils/ragService.js';

// POST /api/materials/upload
// Upload a study material (PDF slides, problem sheet, etc.)
export const uploadMaterial = async (req, res, next) => {
  let saved = false;
  try {
    if (!req.file) fail(400, 'Select a PDF or image');
    const { path: file_url, filename: public_id, mimetype, size } = req.file;
    const { material, course, session } = await classroomTransaction(async tx => {
      let session = req.body.session_id ? await tx.session.findUnique({ where: { id: positiveId(req.body.session_id) } }) : null;
      if (req.body.session_id && !session) fail(404, 'Lecture not found');
      let course = req.body.course_id ? await tx.course.findUnique({ where: { id: positiveId(req.body.course_id) } }) : session ? await resolveLectureCourse(tx, session, req.user) : null;
      if (!course) fail(400, 'Select a course or lecture');
      assertOwner(req.user, course.teacher_id);
      if (session) {
        assertOwner(req.user, session.teacher_id);
      if (session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
        if (session.course_id && session.course_id !== course.id) fail(400, 'Course does not match the lecture');
        session = await tx.session.update({ where: { id: session.id }, data: { course_id: course.id } });
      }
      const material = await tx.courseMaterial.create({ data: { title: req.body.title.trim(), course_id: course.id, session_id: session?.id || null, category: req.body.category || 'Lecture Slides', file_url, public_id, file_type: mimetype === 'application/pdf' ? 'pdf' : 'image', file_size: size || null, index_status: mimetype === 'application/pdf' ? 'pending' : 'unsupported' } });
      return { material, course, session };
    });
    saved = true;
    await materialChanged(req.app.get('io'), course, session, 'material-received', material);
    res.status(201).json(material);
    if (material.file_type === 'pdf') processAndEmbedMaterial(material.id, file_url, req.app.get('io')).catch(() => console.warn('Material indexing failed; retry required'));
  } catch (err) {
    if (!saved && req.file?.filename) { await queueAsset({ public_id: req.file.filename, file_type: req.file.mimetype === 'application/pdf' ? 'pdf' : 'image' }); retryAssetCleanup().catch(() => {}); }
    next(err);
  }
};

export const getMaterialsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const cId = parseInt(courseId);

    const materials = await getOrSetCache(`cache:materials:course:${cId}`, 600, async () => {
      return prisma.courseMaterial.findMany({
        where: { course_id: cId },
        include: {
          session: {
            select: {
              id: true,
              title: true,
              session_code: true
            }
          }
        },
        orderBy: { uploaded_at: 'desc' }
      });
    });

    res.json(materials);

  } catch (err) {
    console.error('getMaterialsByCourse error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/materials/session/:sessionId
// Fetch materials associated with a specific lecture session
export const getMaterialsBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const materials = await prisma.courseMaterial.findMany({
      where: { session_id: parseInt(sessionId) },
      orderBy: { uploaded_at: 'asc' }
    });

    res.json(materials);

  } catch (err) {
    console.error('getMaterialsBySession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/materials/:id
// Delete a specific study material
export const deleteMaterial = async (req, res, next) => {
  try {
    const result = await classroomTransaction(async tx => {
      const material = await tx.courseMaterial.findUnique({ where: { id: positiveId(req.params.id) } });
      if (!material) fail(404, 'Material not found');
      const course = await tx.course.findUnique({ where: { id: material.course_id } });
      assertOwner(req.user, course.teacher_id);
      const session = material.session_id ? await tx.session.findUnique({ where: { id: material.session_id } }) : null;
      await tx.materialChunk.deleteMany({ where: { material_id: material.id } });
      await tx.courseMaterial.delete({ where: { id: material.id } });
      await queueAsset(material, 0, tx);
      return { material, course, session };
    });
    await materialChanged(req.app.get('io'), result.course, result.session, 'material-removed', result.material.id);
    retryAssetCleanup().catch(() => {});
    res.json({ message: 'Material deleted' });
  } catch (err) { next(err); }
};

export const saveMediaToVault = async (req, res, next) => {
  try {
    const { material, course, session } = await classroomTransaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: positiveId(req.body.session_id) } });
      if (!session) fail(404, 'Lecture not found');
      assertOwner(req.user, session.teacher_id);
      if (session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      const ref = String(req.body.media_id);
      const media = await tx.sessionMedia.findFirst({ where: { session_id: session.id, OR: [{ public_id: ref }, ...(Number.isSafeInteger(Number(ref)) && Number(ref) > 0 ? [{ id: Number(ref) }] : [])] } });
      if (!media) fail(404, 'Image not found in this lecture');
      const course = await resolveLectureCourse(tx, session, req.user);
      const existing = await tx.courseMaterial.findFirst({ where: { course_id: course.id, public_id: media.public_id } });
      const material = existing || await tx.courseMaterial.create({ data: { course_id: course.id, session_id: session.id, title: req.body.title?.trim() || media.caption || 'Whiteboard diagram', category: 'Notes', file_url: media.image_url, public_id: media.public_id, file_type: 'image', index_status: 'unsupported' } });
      return { material, course, session: { ...session, course_id: course.id } };
    });
    await materialChanged(req.app.get('io'), course, session, 'material-received', material);
    res.status(201).json(material);
  } catch (err) { next(err); }
};

export const proxyDownload = async (req, res, next) => {
  try {
    const { url, filename } = req.query;
    let parsed;
    try { parsed = new URL(url); } catch { fail(400, 'Invalid download URL'); }
    const cloudPath = '/' + process.env.CLOUDINARY_CLOUD_NAME + '/';
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.port || parsed.username || parsed.password || !parsed.pathname.startsWith(cloudPath)) fail(400, 'Only files stored by AskAnon can be downloaded');
    const material = await prisma.courseMaterial.findFirst({ where: { file_url: url } });
    if (material) await courseAccess(req.user, material.course_id);
    else {
      const media = await prisma.sessionMedia.findFirst({ where: { image_url: url } });
      if (media) await sessionAccess(req.user, media.session_id);
      else {
        const question = await prisma.question.findFirst({ where: { image_url: url } });
        if (!question) fail(404, 'File not found in this classroom');
        await sessionAccess(req.user, question.session_id);
      }
    }
    const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) fail(502, upstream.status === 401 ? 'Cloudinary PDF delivery is restricted. Enable PDF delivery in the storage account.' : 'Storage could not provide this file');
    const maxBytes = 25 * 1024 * 1024;
    if (Number(upstream.headers.get('content-length')) > maxBytes) { await upstream.body.cancel(); fail(413, 'File exceeds the download limit'); }
    const chunks = []; let size = 0;
    for await (const chunk of upstream.body) {
      size += chunk.length;
      if (size > maxBytes) fail(413, 'File exceeds the download limit');
      chunks.push(chunk);
    }
    const safeName = String(filename || 'download').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '"');
    res.send(Buffer.concat(chunks));
  } catch (err) { next(err); }
};

// POST /api/materials/:id/ask
// Chat with a specific material using RAG
export const askMaterial = async (req, res) => {
  try {
    const question = req.body.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 2000) return res.status(400).json({ error: 'Enter a question of 1?2000 characters.' });
    const material = await prisma.courseMaterial.findUnique({ where: { id: Number(req.params.id) } });
    if (!material) return res.status(404).json({ error: 'Material not found' });
    const { askMaterialRag } = await import('../utils/ragService.js');
    res.json(await askMaterialRag(material, question.trim(), req.body.mode || 'ask', req.body.history || []));

  } catch (err) {
    sendAIError(res, err);
  }
};

export const retryMaterialIndex = async (req, res) => {
  const material = await prisma.courseMaterial.findUnique({ where: { id: Number(req.params.id) } });
  if (!material || material.file_type !== 'pdf') return res.status(400).json({ error: 'Select a text-based PDF to index.' });
  res.status(202).json({ message: 'Indexing requested. Status will update automatically.' });
  processAndEmbedMaterial(material.id, material.file_url, req.app.get('io')).catch(() => {});
};
