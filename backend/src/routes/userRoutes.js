import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// POST /api/users/sync — create or fetch user (no role needed)
router.post('/sync', async (req, res) => {
  const { clerk_user_id, email, name } = req.body;

  if (!clerk_user_id || !email) {
    return res.status(400).json({ error: 'clerk_user_id and email are required' });
  }

  try {
    const existing = await pool.query(
      'SELECT * FROM users WHERE clerk_user_id = $1',
      [clerk_user_id]
    );
    if (existing.rows.length > 0) return res.json(existing.rows[0]);

    const result = await pool.query(
      `INSERT INTO users (clerk_user_id, email, name, role)
       VALUES ($1, $2, $3, 'student') RETURNING *`,
      [clerk_user_id, email, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('User sync error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me
router.get('/me', async (req, res) => {
  if (!req.user) return res.status(404).json({ error: 'User not found' });
  res.json(req.user);
});

export default router;