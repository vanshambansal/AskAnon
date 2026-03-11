import pool from '../config/db.js';

// Generate a random 6-character session code (e.g. "ABC123")
const generateSessionCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// POST /api/sessions — Teacher creates a session
export const createSession = async (req, res) => {
  const { teacher_id, title, subject } = req.body;


  // Basic validation
  if (!teacher_id || !title) {
    return res.status(400).json({ error: 'teacher_id and title are required' });
  }

  try {
    let session_code;
    let isUnique = false;

    // Keep generating codes until we get a unique one
    while (!isUnique) {
      session_code = generateSessionCode();
      const existing = await pool.query(
        'SELECT id FROM sessions WHERE session_code = $1',
        [session_code]
      );
      if (existing.rows.length === 0) isUnique = true;
    }

    const result = await pool.query(
      `INSERT INTO sessions (teacher_id, session_code, title, subject)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [teacher_id, session_code, title, subject]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('createSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/sessions/:code — Student joins with code
export const getSessionByCode = async (req, res) => {
  const { code } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM sessions WHERE session_code = $1',
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];

    if (!session.is_active) {
      return res.status(400).json({ error: 'This session has ended' });
    }

    res.json(session);

  } catch (err) {
    console.error('getSessionByCode error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/sessions/:id/end — Teacher ends session
export const endSession = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE sessions
       SET is_active = false, ended_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session ended', session: result.rows[0] });

  } catch (err) {
    console.error('endSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/sessions/teacher/:teacherId
export const getSessionsByTeacher = async (req, res) => {
  const { teacherId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM sessions WHERE teacher_id = $1 ORDER BY started_at DESC`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getSessionsByTeacher error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};



export const deleteSession = async (req, res) => {
  const { id } = req.params;
  try {
    // Only allow deleting ended sessions
    const check = await pool.query(
      'SELECT * FROM sessions WHERE id = $1',
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (check.rows[0].is_active) {
      return res.status(400).json({ error: 'End the session before deleting' });
    }
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('deleteSession error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};


