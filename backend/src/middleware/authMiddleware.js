import { createClerkClient } from '@clerk/clerk-sdk-node';
import redisClient from '../config/redis.js';
import pool from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// ─── AUTH MIDDLEWARE ───────────────────────────────────────
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token with Clerk
    const payload = await clerk.verifyToken(token);
    const clerkUserId = payload.sub;

    // Find user in our DB
    const result = await pool.query(
      'SELECT * FROM users WHERE clerk_user_id = $1',
      [clerkUserId]
    );

    if (result.rows.length === 0) {
      // User not in DB yet — attach clerkUserId so sync route can use it
      req.clerkUserId = clerkUserId;
      req.user = null;
      return next();
    }

    req.user = result.rows[0];
    req.clerkUserId = clerkUserId;
    next();

  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── TEACHER ONLY ──────────────────────────────────────────
export const requireTeacher = (req, res, next) => {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Only teachers can do this' });
  }
  next();
};

// ─── RATE LIMITER ──────────────────────────────────────────
export const rateLimiter = async (req, res, next) => {
  const user_id = req.user?.id || req.body.user_id;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const key = `ratelimit:${user_id}`;

  try {
    const exists = await redisClient.get(key);
    if (exists) {
      const ttl = await redisClient.ttl(key);
      return res.status(429).json({
        error: `Please wait ${ttl} seconds before posting again`
      });
    }
    await redisClient.setEx(key, 30, '1');
    next();
  } catch (err) {
    console.error('Rate limiter error:', err.message);
    next();
  }
};