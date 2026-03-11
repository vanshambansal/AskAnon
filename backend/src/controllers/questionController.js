import pool from '../config/db.js';

// POST /api/questions — Student posts a question
export const createQuestion = async (req, res) => {
  const { session_id, question_text, category } = req.body;

  if (!session_id || !question_text) {
    return res.status(400).json({ error: 'session_id and question_text are required' });
  }

  if (question_text.trim().length < 5) {
    return res.status(400).json({ error: 'Question is too short' });
  }

  try {
    // Check session is still active
    const session = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND is_active = true',
      [session_id]
    );

    if (session.rows.length === 0) {
      return res.status(400).json({ error: 'Session not found or has ended' });
    }

    const result = await pool.query(
      `INSERT INTO questions (session_id, question_text, category)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [session_id, question_text.trim(), category || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('createQuestion error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/questions/:sessionId — Get all questions, sorted by upvotes
export const getQuestions = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM questions
       WHERE session_id = $1
       ORDER BY upvotes DESC, created_at ASC`,
      [sessionId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('getQuestions error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/questions/:id/answer — Teacher marks as answered
export const markAnswered = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE questions
       SET is_answered = true
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('markAnswered error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/questions/:id — Teacher deletes a question
export const deleteQuestion = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM questions WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ message: 'Question deleted' });

  } catch (err) {
    console.error('deleteQuestion error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/questions/:id/upvote — Student upvotes a question
export const upvoteQuestion = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    // Check if already voted
    const existing = await pool.query(
      'SELECT * FROM votes WHERE question_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already upvoted this question' });
    }

    // Add vote record
    await pool.query(
      'INSERT INTO votes (question_id, user_id) VALUES ($1, $2)',
      [id, user_id]
    );

    // Increment upvote count on the question
    const result = await pool.query(
      `UPDATE questions
       SET upvotes = upvotes + 1
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error('upvoteQuestion error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};