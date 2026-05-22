import pool from '../config/db.js';
import cloudinary from '../config/cloudinary.js';

// POST /api/upload/question
// Student attaches image to their question
export const uploadQuestionImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // req.file is populated by multer after upload to Cloudinary
    const { path: image_url, filename: public_id } = req.file;

    res.status(201).json({
      image_url,
      public_id,
      message: 'Image uploaded successfully'
    });

  } catch (err) {
    console.error('Upload question image error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// POST /api/upload/session/:sessionId/media
// Teacher shares image/diagram in session
export const uploadSessionMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId } = req.params;
    const { caption } = req.body;
    const { path: image_url, filename: public_id } = req.file;

    // Save to session_media table
    const result = await pool.query(
      `INSERT INTO session_media (session_id, image_url, public_id, caption)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, image_url, public_id, caption || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Upload session media error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
};

// GET /api/upload/session/:sessionId/media
// Get all media shared in a session
export const getSessionMedia = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await pool.query(
      `SELECT * FROM session_media
       WHERE session_id = $1
       ORDER BY uploaded_at ASC`,
      [sessionId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Get session media error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/upload/media/:publicId
// Delete a specific media (teacher removes shared image)
export const deleteMedia = async (req, res) => {
  try {
    const { publicId } = req.params;

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Delete from DB
    await pool.query(
      'DELETE FROM session_media WHERE public_id = $1',
      [publicId]
    );

    res.json({ message: 'Media deleted' });

  } catch (err) {
    console.error('Delete media error:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
};