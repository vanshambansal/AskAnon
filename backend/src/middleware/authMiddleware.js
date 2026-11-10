import { createClerkClient, verifyToken } from '@clerk/backend';
import 'dotenv/config';
import redisClient from '../config/redis.js';
import prisma from '../config/prisma.js';
import { randomUUID } from 'node:crypto';

const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
export const clerk = { users: client.users, verifyToken: token => verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, ...(process.env.CLERK_JWT_KEY ? { jwtKey: process.env.CLERK_JWT_KEY } : {}) }) };
export const roleSwitchEnabled = () => false;
const userCache = new Map();
export const updateUserCache = user => {
  if (user?.clerk_user_id) userCache.set(user.clerk_user_id, { user, expiresAt: Date.now() + 300000 });
};
export const invalidateUserCache = id => userCache.delete(id);

export async function authenticateToken(token) {
  if (!token || typeof token !== 'string') throw Object.assign(new Error('Sign in to continue'), { status: 401 });
  let payload;
  try { payload = await clerk.verifyToken(token); }
  catch { throw Object.assign(new Error('Invalid or expired token'), { status: 401 }); }
  if (!payload.sub) throw Object.assign(new Error('Invalid token'), { status: 401 });
  const cached = userCache.get(payload.sub);
  const user = cached?.expiresAt > Date.now() ? cached.user
    : await prisma.user.findUnique({ where: { clerk_user_id: payload.sub } });
  if (user) updateUserCache(user);
  return { clerkUserId: payload.sub, user };
}

// Sync accepts a verified identity before a database profile exists.
export async function requireIdentity(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const identity = await authenticateToken(token);
    req.clerkUserId = identity.clerkUserId;
    req.user = identity.user;
    next();
  } catch (err) { next(err); }
}
export async function requireAuth(req, res, next) {
  return requireIdentity(req, res, err => {
    if (err) return next(err);
    if (!req.user) return res.status(409).json({ error: 'Please synchronize your profile before continuing', code: 'PROFILE_REQUIRED' });
    // Bind legacy controller identity fields to the verified caller.
    req.body ??= {};
    req.body.user_id = req.user.id;
    req.body.teacher_id = req.user.id;
    next();
  });
}
export function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can do this' });
  next();
}
const memoryRateLimits = new Map();
function limited(res, seconds) {
  res.setHeader('Retry-After', seconds);
  return res.status(429).json({ error: 'Please wait ' + seconds + ' seconds before posting again', retry_after: seconds });
}
export async function rateLimiter(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue' });
  const key = 'ratelimit:' + req.user.id;
  const claimToken = randomUUID();
  const now = Date.now();
  const localExpiry = memoryRateLimits.get(key) || 0;
  if (localExpiry > now) return limited(res, Math.ceil((localExpiry - now) / 1000));
  if (redisClient.isReady) {
    try {
      const claimed = await redisClient.set(key, claimToken, { NX: true, EX: 30 });
      if (!claimed) return limited(res, Math.max(1, await redisClient.ttl(key)));
    } catch { /* Local cooldown remains available during an outage. */ }
  }
  const latestExpiry = memoryRateLimits.get(key) || 0;
  if (latestExpiry > Date.now()) return limited(res, Math.ceil((latestExpiry - Date.now()) / 1000));
  const claimExpiry = Date.now() + 30000;
  memoryRateLimits.set(key, claimExpiry);
  res.once?.('finish', async () => {
    if (!res.locals?.releaseSubmissionCooldown) return;
    try {
      if (redisClient.isReady) await redisClient.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", { keys: [key], arguments: [claimToken] });
    } catch { /* The local slot can still be released when Redis is unavailable. */ }
    if (memoryRateLimits.get(key) === claimExpiry) memoryRateLimits.delete(key);
  });
  if (memoryRateLimits.size > 10000) {
    for (const [id, expiry] of memoryRateLimits) if (expiry <= now) memoryRateLimits.delete(id);
  }
  next();
}
export async function penalizeUserRateLimit(userId, penaltySeconds = 120) {
  if (!userId) return;
  const key = 'ratelimit:' + userId;
  memoryRateLimits.set(key, Date.now() + penaltySeconds * 1000);
  if (redisClient.isReady) {
    try { await redisClient.setEx(key, penaltySeconds, '1'); } catch { /* Local penalty remains active. */ }
  }
}
