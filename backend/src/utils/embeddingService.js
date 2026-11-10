import crypto from 'crypto';
import { generateEmbedding } from './ragService.js';
import { getOrSetCache } from './cacheHelper.js';

/**
 * In-memory fallback cache if Redis is temporarily unreachable
 */
const localEmbeddingCache = new Map();

/**
 * Computes vector cosine similarity between two float arrays.
 * Formula: (A · B) / (||A|| * ||B||)
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Value between -1.0 and 1.0 (typically 0.0 to 1.0 for embeddings)
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Question vectors use the same 768-dimensional model as document search. */
export async function getCachedEmbedding(text) {
  if (!text?.trim()) return null;
  const hash = crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
  return localEmbeddingCache.get(hash) || getOrSetCache(`emb:v2:768:${hash}`, 86400, async () => null);
}
export async function getEmbedding(text) {
  if (!process.env.GEMINI_API_KEY || typeof text !== 'string' || text.trim().length < 5) return null;
  const clean = text.trim();
  const hash = crypto.createHash('md5').update(clean.toLowerCase()).digest('hex');
  if (localEmbeddingCache.has(hash)) return localEmbeddingCache.get(hash);
  try {
    const values = await getOrSetCache(`emb:v2:768:${hash}`, 86400, () => generateEmbedding(clean, AbortSignal.timeout(1800)));
    if (localEmbeddingCache.size >= 2000) localEmbeddingCache.delete(localEmbeddingCache.keys().next().value);
    localEmbeddingCache.set(hash, values);
    return values;
  } catch { return null; }
}

/**
 * Checks an incoming question against an array of active candidate questions.
 * Compares embeddings and identifies if any existing question exceeds DUPLICATE_THRESHOLD.
 * @param {string} newQuestionText
 * @param {Array<{ id: number, question_text: string, upvotes: number }>} candidateQuestions
 * @returns {Promise<{ hasDuplicate: boolean, matchedQuestion?: object, score?: number }>}
 */
export async function findSimilarQuestion(newQuestionText, candidateQuestions = []) {
  if (!newQuestionText || !candidateQuestions.length) {
    return { hasDuplicate: false };
  }

  // Generate embedding for incoming question
  const newEmbedding = await getEmbedding(newQuestionText);
  if (!newEmbedding) {
    // Fail-open: If Gemini is unavailable, do not block the user
    return { hasDuplicate: false };
  }

  let bestMatch = null;
  let highestScore = -1;

  // Retrieve or compute embeddings for candidate questions in parallel
  const candidateEmbeddings = await Promise.all(
    candidateQuestions.map(async (q) => {
      const emb = await getCachedEmbedding(q.question_text);
      return { question: q, embedding: emb };
    })
  );

  for (const item of candidateEmbeddings) {
    if (!item.embedding) continue;
    const sim = cosineSimilarity(newEmbedding, item.embedding);

    if (sim > highestScore) {
      highestScore = sim;
      bestMatch = item.question;
    }
  }

  const threshold = parseFloat(process.env.DUPLICATE_THRESHOLD || '0.82');
  const hasDuplicate = highestScore >= threshold;

  return {
    hasDuplicate,
    matchedQuestion: hasDuplicate ? bestMatch : null,
    score: highestScore > 0 ? highestScore : 0,
    threshold
  };
}
