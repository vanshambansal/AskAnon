import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

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


router.get('/me', async (req, res) => {
  try {
    // If query param provided (Postman testing)
    if (req.query.clerk_user_id) {
      const result = await pool.query(
        'SELECT * FROM users WHERE clerk_user_id = $1',
        [req.query.clerk_user_id]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' })
      }
      return res.json(result.rows[0])
    }

    // Normal frontend call uses req.user from auth middleware
    if (!req.user) return res.status(404).json({ error: 'User not found' })
    res.json(req.user)

  } catch (err) {
    console.error('Me error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})


export default router;