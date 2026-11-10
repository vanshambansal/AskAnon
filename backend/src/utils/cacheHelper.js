import redisClient from '../config/redis.js';
import prisma from '../config/prisma.js';

const memoryCache = new Map();
const pending = new Map();
let revision = 0;

/**
 * Cache-Aside Pattern Helper:
 * 1. Checks Redis for existing cache under key.
 * 2. On Cache Hit: Returns parsed JSON directly in ~1ms.
 * 3. On Cache Miss: Executes fetchFn() to query database.
 * 4. Asynchronously saves fresh data to Redis with specified TTL.
 * 5. Fails open gracefully if Redis is temporarily unavailable.
 *
 * @template T
 * @param {string} key - Unique Redis cache key
 * @param {number} ttlSeconds - Time-To-Live in seconds
 * @param {() => Promise<T>} fetchFn - Database query function executed on cache miss
 * @returns {Promise<T>}
 */
export async function getOrSetCache(key, ttlSeconds, fetchFn) {
  const jobKey = `${revision}:${key}`;
  if (pending.has(jobKey)) return pending.get(jobKey);
  const work = readThrough(key, ttlSeconds, fetchFn).finally(() => pending.delete(jobKey));
  if (pending.size < 1000) pending.set(jobKey, work);
  return work;
}

async function readThrough(key, ttlSeconds, fetchFn) {
  const startedAtRevision = revision;
  const local = memoryCache.get(key);
  if (local?.expiresAt > Date.now()) return JSON.parse(local.value);
  memoryCache.delete(key);
  try {
    if (redisClient?.isReady) {
      const cached = await redisClient.get(key);
      if (cached !== null && cached !== undefined && revision === startedAtRevision) {
        if (memoryCache.size >= 1000) memoryCache.delete(memoryCache.keys().next().value);
        memoryCache.set(key, { value: cached, expiresAt: Date.now() + Math.min(ttlSeconds, 30) * 1000 });
        return JSON.parse(cached);
      }
    }
  } catch (err) {
    console.warn(`⚠️ [Cache] Read error for "${key}":`, err.message);
  }

  // Cache miss: Execute authoritative database query
  const freshData = await fetchFn();
  // A read started before a mutation must not refill a cache that was just invalidated.
  if (revision !== startedAtRevision) return freshData;

  if (freshData !== undefined && freshData !== null) {
    if (memoryCache.size >= 1000) memoryCache.delete(memoryCache.keys().next().value);
    memoryCache.set(key, { value: JSON.stringify(freshData), expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  try {
    if (redisClient?.isReady && freshData !== undefined && freshData !== null) {
      // Local readers already have the result. Enqueue the shared cache fill
      // without making the caller wait for another remote network round trip.
      // Commands on this client stay ordered before a later invalidation DEL.
      void redisClient.setEx(key, ttlSeconds, JSON.stringify(freshData)).catch(() => {});
    }
  } catch (err) {
    console.warn(`⚠️ [Cache] Write error for "${key}":`, err.message);
  }

  return freshData;
}

/**
 * Invalidate one or more exact Redis keys.
 * Used upon database mutations (create, update, delete).
 *
 * @param {...string} keys - Cache keys to delete
 */
export async function invalidateCache(...keys) {
  revision++;
  keys.forEach(key => memoryCache.delete(key));
  try {
    if (!redisClient?.isReady) return;
    const validKeys = keys.filter(Boolean);
    if (validKeys.length > 0) {
      await redisClient.del(validKeys);
    }
  } catch (err) {
    console.warn('⚠️ [Cache] Invalidation error:', err.message);
  }
}

// Course responses embed materials and lecture counts, so changing a child must
// invalidate the parent response as well as its standalone resource list.
export async function invalidateCourseCache(courseId) {
  if (!courseId) return;
  let course;
  try {
    course = await prisma.course.findUnique({
      where: { id: Number(courseId) },
      select: { teacher_id: true, enrollments: { select: { user_id: true } } }
    });
  } catch {
    // A cache cleanup failure must not turn a committed upload into a failed upload.
    console.warn('Course cache metadata unavailable');
  }
  await invalidateCache(
    `cache:courses:details:${courseId}`,
    `cache:materials:course:${courseId}`,
    `cache:rag:manifest:${courseId}`,
    ...(course ? [`cache:courses:teacher:${course.teacher_id}`, `cache:sessions:teacher:${course.teacher_id}`] : []),
    ...(course?.enrollments || []).flatMap(e => [`cache:courses:enrolled:${e.user_id}`, `cache:sessions:history:student:${e.user_id}`])
  );
}
