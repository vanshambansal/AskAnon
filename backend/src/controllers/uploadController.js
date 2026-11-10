import prisma from '../config/prisma.js';
import { classroomTransaction } from '../utils/transaction.js';
import { assertOwner, positiveId, fail } from '../middleware/accessMiddleware.js';
import { imageReceipt, queueAsset, retryAssetCleanup } from '../utils/storageLifecycle.js';
import { invalidateSession, roomEvent } from '../utils/classroomEvents.js';

export const uploadQuestionImage = async (req, res, next) => {
  try {
    if (!req.file) fail(400, 'Select an image');
    const { path: image_url, filename: public_id } = req.file;
    await queueAsset({ public_id }, 24 * 60 * 60 * 1000);
    res.status(201).json({ image_url, public_id, image_receipt: imageReceipt(req.user.id, image_url, public_id) });
  } catch (err) { next(err); }
};
export const uploadSessionMedia = async (req, res, next) => {
  let saved = false;
  try {
    if (!req.file) fail(400, 'Select an image');
    const { media, session } = await classroomTransaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: positiveId(req.params.sessionId) } });
      if (!session?.is_active || session.deletion_job_id) fail(409, 'This lecture has ended');
      assertOwner(req.user, session.teacher_id);
      if (session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      const media = await tx.sessionMedia.create({ data: { session_id: session.id, image_url: req.file.path, public_id: req.file.filename, caption: req.body.caption?.trim() || null } });
      return { media, session };
    });
    saved = true;
    await invalidateSession(session);
    roomEvent(req.app.get('io'), session, 'media-received', media);
    res.status(201).json(media);
  } catch (err) {
    if (!saved && req.file?.filename) { await queueAsset({ public_id: req.file.filename }); retryAssetCleanup().catch(() => {}); }
    next(err);
  }
};
export const getSessionMedia = async (req, res, next) => {
  try { res.json(await prisma.sessionMedia.findMany({ where: { session_id: positiveId(req.params.sessionId) }, orderBy: { uploaded_at: 'asc' } })); }
  catch (err) { next(err); }
};
export const deleteMedia = async (req, res, next) => {
  try {
    const { media, session } = await classroomTransaction(async tx => {
      const media = await tx.sessionMedia.findFirst({ where: { public_id: req.params.publicId } });
      if (!media) fail(404, 'Image not found');
      const session = await tx.session.findUnique({ where: { id: media.session_id } });
      assertOwner(req.user, session.teacher_id);
      if (session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      await tx.sessionMedia.delete({ where: { id: media.id } });
      await queueAsset(media, 0, tx);
      return { media, session };
    });
    await invalidateSession(session);
    roomEvent(req.app.get('io'), session, 'media-removed', media.public_id);
    retryAssetCleanup().catch(() => {});
    res.json({ message: 'Image removed from the gallery; saved vault copies retained' });
  } catch (err) { next(err); }
};
