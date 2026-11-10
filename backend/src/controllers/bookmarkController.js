import prisma from '../config/prisma.js';

// POST /api/bookmarks/:questionId/toggle
export const toggleBookmark = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const qId = parseInt(questionId);
    const uId = parseInt(userId);

    const existing = await prisma.bookmark.findUnique({
      where: {
        user_id_question_id: {
          user_id: uId,
          question_id: qId
        }
      }
    });

    if (existing) {
      await prisma.bookmark.delete({
        where: { id: existing.id }
      });
      return res.json({ bookmarked: false, message: 'Bookmark removed' });
    } else {
      await prisma.bookmark.create({
        data: {
          user_id: uId,
          question_id: qId
        }
      });
      return res.json({ bookmarked: true, message: 'Question bookmarked' });
    }
  } catch (err) {
    console.error('Toggle bookmark error:', err);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
};

// GET /api/bookmarks/my?user_id=123
export const getMyBookmarks = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        user_id: parseInt(userId), question: { status: { notIn: ['FLAGGED', 'DISMISSED'] }, session: { deletion_job_id: null } }
      },
      include: {
        question: {
          include: {
            session: {
              include: {
                course: true,
                teacher: {
                  select: { name: true, email: true }
                }
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(bookmarks);
  } catch (err) {
    console.error('Get my bookmarks error:', err);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
};

// GET /api/bookmarks/session/:sessionId?user_id=123
export const getSessionBookmarks = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.json([]);
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        user_id: parseInt(userId),
        question: {
          session_id: parseInt(sessionId)
        }
      },
      select: {
        question_id: true
      }
    });

    res.json(bookmarks.map(b => b.question_id));
  } catch (err) {
    console.error('Get session bookmarks error:', err);
    res.status(500).json({ error: 'Failed to fetch session bookmarks' });
  }
};
