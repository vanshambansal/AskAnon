import { timeOperation } from '../utils/requestTiming.js';
import prisma from '../config/prisma.js';
import { checkLocalProfanity, checkAIModeration } from '../utils/contentModerator.js';
import { penalizeUserRateLimit } from '../middleware/authMiddleware.js';
import { findSimilarQuestion, getEmbedding } from '../utils/embeddingService.js';
import { assertOwner, fail, positiveId } from '../middleware/accessMiddleware.js';
import { classroomTransaction } from '../utils/transaction.js';
import { invalidateCache, invalidateCourseCache } from '../utils/cacheHelper.js';
import { workspaceChanged } from '../utils/classroomEvents.js';
import { retryAssetCleanup, queueAsset, verifyImageReceipt } from '../utils/storageLifecycle.js';

const publish = async (req, session, event, payload) => {
  await invalidateCache(`cache:session:code:${session.session_code}`, `cache:session:id:${session.id}`, `cache:sessions:teacher:${session.teacher_id}`, `cache:room:questions:${session.id}`);
  req.app.get('io')?.to(session.session_code).emit(event, payload);
  // Aggregate counts reconcile after their caches are invalidated; the live answer need not wait.
  invalidateCourseCache(session.course_id).then(() => workspaceChanged(req.app.get('io'), session)).catch(() => {});
};

export const createQuestion = async (req, res, next) => {
  try {
    const body = req.body;
    const text = typeof body.question_text === 'string' ? body.question_text.trim() : '';
    const code = typeof body.code_snippet === 'string' ? body.code_snippet.trim() : '';
    const type = body.content_type || 'QUESTION';
    const imageId = body.image_url ? verifyImageReceipt(body.image_receipt, req.user.id, body.image_url) : null;
    if (!['QUESTION', 'NOTE', 'CODE'].includes(type)) fail(400, 'Invalid content type');
    if (!text && !code && !body.image_url) fail(400, 'Add text, code or an image');
    if (text.length > (type === 'QUESTION' ? 300 : 5000) || code.length > 20000) fail(400, 'Your submission is too long');
    if (type === 'QUESTION' && text) {
      const local = checkLocalProfanity(text);
      if (!local.isSafe) {
        await penalizeUserRateLimit(req.user.id, 120);
        return res.status(400).json({ error: local.reason, penalty_seconds: 120 });
      }
    }
    const moderationText = [text, code ? `Code: ${code.slice(0, 1200)}` : ''].filter(Boolean).join('\n')
    const moderation = type === 'QUESTION' && moderationText
      ? await checkAIModeration(moderationText, req.classroom?.title || '', req.classroom?.subject || '')
      : { isSafe: true, reviewed: false, category: type === 'QUESTION' ? 'attachment_only' : 'instructor' }
    if (type === 'QUESTION' && moderationText && !moderation.isSafe) {
      res.locals ||= {};
      res.locals.releaseSubmissionCooldown = true;
      return res.status(moderation.reviewed ? 422 : 503).json({
        error: moderation.reviewed ? moderation.reason : 'Automatic question checks are unavailable. Your draft is kept; please retry shortly.',
        code: moderation.reviewed ? 'QUESTION_REJECTED' : 'MODERATION_UNAVAILABLE'
      });
    }
    const { question, session } = await classroomTransaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: positiveId(body.session_id) } });
      if (!session?.is_active || session.deletion_job_id) fail(409, 'This lecture has ended');
      if (type !== 'QUESTION') assertOwner(req.user, session.teacher_id);
      if (session.is_paused && req.user.id !== session.teacher_id) fail(409, 'Question intake is paused by the professor');
      let related = null;
      if (body.related_to_id) {
        related = await tx.question.findFirst({ where: { id: positiveId(body.related_to_id), session_id: session.id } });
        if (!related) fail(400, 'The related question is no longer available');
      }
      if (type !== 'QUESTION') await tx.question.updateMany({ where: { session_id: session.id, status: 'PINNED' }, data: { status: 'PENDING', pinned_at: null } });
      const question = await tx.question.create({ data: {
        session_id: session.id, question_text: text, content_type: type,
        category: typeof body.category === 'string' ? body.category.trim() : null,
        code_snippet: code || null, code_language: code ? String(body.code_language || 'text').slice(0, 30) : null,
        image_url: body.image_url || null, image_public_id: imageId,
        moderation_status: moderation.reviewed ? 'checked' : moderation.category || 'unavailable',
        moderation_reason: null,
        status: type === 'QUESTION' ? 'PENDING' : 'PINNED', pinned_at: type === 'QUESTION' ? null : new Date(),
        related_to_id: related?.id || null, related_text: related?.question_text || null
      } });
      return { question, session };
    });
    await publish(req, session, type === 'QUESTION' ? 'question-received' : 'question-pinned', question)
    res.status(201).json(question)
    if (type === 'QUESTION' && text) getEmbedding(text).catch(() => {})

  } catch (err) { next(err); }
};

export const getQuestions = async (req, res, next) => {
  try {
    res.json(await prisma.question.findMany({ where: { session_id: positiveId(req.params.sessionId), ...(req.classroom?.teacher_id === req.user.id ? {} : { status: { notIn: ['FLAGGED', 'DISMISSED'] } }) }, orderBy: [{ upvotes: 'desc' }, { created_at: 'asc' }] }));
  } catch (err) { next(err); }
};

export const updateQuestionStatus = async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['PENDING', 'PINNED', 'ANSWERED', 'DISMISSED'].includes(status)) fail(400, 'Invalid question status');
    const { question, session } = await timeOperation(res, 'transaction', () => classroomTransaction(async tx => {
      const existing = await tx.question.findUnique({ where: { id: positiveId(req.params.id) }, include: { session: true } });
      if (!existing) fail(404, 'Question not found');
      assertOwner(req.user, existing.session.teacher_id);
      if (existing.session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      if (status === 'PINNED') await tx.question.updateMany({ where: { session_id: existing.session_id, status: 'PINNED' }, data: { status: 'PENDING', pinned_at: null } });
      const question = await tx.question.update({ where: { id: existing.id }, data: { status, pinned_at: status === 'PINNED' ? new Date() : null, is_answered: status === 'ANSWERED', answered_at: status === 'ANSWERED' ? new Date() : null } });
      return { question, session: existing.session };
    }));
    await timeOperation(res, 'invalidate_notify', () => publish(req, session, status === 'PINNED' ? 'question-pinned' : 'question-updated', question));
    res.json(question);
  } catch (err) { next(err); }
};
export const markAnswered = (req, res, next) => { req.body.status = 'ANSWERED'; return updateQuestionStatus(req, res, next); };

export const answerQuestionWithText = async (req, res, next) => {
  try {
    const text = typeof req.body.answer_text === 'string' ? req.body.answer_text.trim() : '';
    if (!text || text.length > 10000) fail(400, 'Enter an explanation of 1?10000 characters');
    const { question, session } = await classroomTransaction(async tx => {
      const existing = await tx.question.findUnique({ where: { id: positiveId(req.params.id) }, include: { session: true } });
      if (!existing) fail(404, 'Question not found');
      assertOwner(req.user, existing.session.teacher_id);
      if (existing.session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      const question = await tx.question.update({ where: { id: existing.id }, data: { answer_text: text, is_answered: true, status: 'ANSWERED', pinned_at: null, answered_at: new Date() } });
      return { question, session: existing.session };
    });
    await publish(req, session, 'question-updated', question);
    res.json(question);
  } catch (err) { next(err); }
};

export const upvoteQuestion = async (req, res, next) => {
  try {
    const { question, session } = await classroomTransaction(async tx => {
      const existing = await tx.question.findUnique({ where: { id: positiveId(req.params.id) }, include: { session: true } });
      if (!existing) fail(404, 'Question not found');
      if (existing.session.teacher_id === req.user.id && req.user.role === 'teacher') fail(403, 'Hosts cannot upvote their own lecture questions');
      if (existing.session.deletion_job_id || !existing.session.is_active || existing.is_answered || !['PENDING', 'PINNED'].includes(existing.status)) fail(409, 'Voting is closed for this question');
      await tx.vote.create({ data: { question_id: existing.id, user_id: req.user.id } });
      const question = await tx.question.update({ where: { id: existing.id }, data: { upvotes: { increment: 1 } } });
      return { question, session: existing.session };
    });
    await publish(req, session, 'question-updated', question);
    res.json(question);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'You already upvoted this question' });
    next(err);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const existing = await classroomTransaction(async tx => {
      const q = await tx.question.findUnique({ where: { id: positiveId(req.params.id) }, include: { session: true } });
      if (!q) fail(404, 'Question not found');
      assertOwner(req.user, q.session.teacher_id);
      if (q.session.deletion_job_id) fail(410, 'This lecture is queued for deletion');
      await tx.bookmark.deleteMany({ where: { question_id: q.id } });
      await tx.vote.deleteMany({ where: { question_id: q.id } });
      await tx.question.updateMany({ where: { related_to_id: q.id }, data: { related_to_id: null, related_text: null } });
      await tx.question.delete({ where: { id: q.id } });
      await queueAsset({ public_id: q.image_public_id }, 0, tx);
      return q;
    });
    await publish(req, existing.session, 'question-removed', existing.id);
    retryAssetCleanup().catch(() => {});
    res.json({ message: 'Question deleted' });
  } catch (err) { next(err); }
};

/**
 * On-Submit Semantic Duplicate Pre-Check
 * Evaluates whether an incoming question has high cosine similarity (>= DUPLICATE_THRESHOLD)
 * to an already active doubt in the session.
 */
export const checkDuplicateQuestion = async (req, res) => {
  const { session_id, question_text } = req.body;

  if (!session_id || !question_text || typeof question_text !== 'string') {
    return res.json({ hasDuplicate: false });
  }

  const cleanText = question_text.trim();

  // 1. Skip trivial/empty inputs (< 3 chars)
  if (cleanText.length < 3) {
    return res.json({ hasDuplicate: false });
  }

  try {
    // 2. Fetch active pending/pinned questions in the session
    const activeQuestions = await prisma.question.findMany({
      where: {
        session_id: parseInt(session_id),
        status: { in: ['PENDING', 'PINNED'] },
        content_type: 'QUESTION',
        image_url: null, code_snippet: null
      },
      select: {
        id: true,
        question_text: true,
        upvotes: true,
        created_at: true
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 25 // Focus on active room questions
    });

    if (!activeQuestions || activeQuestions.length === 0) {
      return res.json({ hasDuplicate: false });
    }

    // 3. Fast exact/normalized string check (0ms, 0 API calls)
    const normalize = (str) =>
      str
        .trim()
        .toLowerCase()
        .replace(/[?!.,;:]+$/, '')
        .replace(/\s+/g, ' ');

    const normalizedInput = normalize(cleanText);
    const exactMatch = activeQuestions.find(
      (q) => normalize(q.question_text) === normalizedInput
    );
    if (exactMatch) {
      return res.json({
        hasDuplicate: true,
        matchedQuestion: exactMatch,
        score: 1.0,
        threshold: parseFloat(process.env.DUPLICATE_THRESHOLD || '0.82')
      });
    }

    // Start the relevance check alongside duplicate matching, so posting can reuse its result.
    checkAIModeration(cleanText, req.classroom?.title || '', req.classroom?.subject || '').catch(() => {});
    // 4. Vector Cosine Similarity Check via Gemini Embeddings
    const result = await findSimilarQuestion(cleanText, activeQuestions);
    return res.json(result);

  } catch (err) {
    console.warn('⚠️ [DuplicateCheck] Failed open due to error:', err.message);
    // Fail-open: Never block student submission if Gemini fails
    return res.json({ hasDuplicate: false });
  }
};
