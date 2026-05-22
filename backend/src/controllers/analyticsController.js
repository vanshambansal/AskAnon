import prisma from "../config/prisma.js";

export const getTeacherAnalytics = async (req, res) => {
  try {
    const { teacherId } = req.params;

    // Total sessions
    const totalSessions = await prisma.session.count({
      where: {
        teacher_id: parseInt(teacherId)
      }
    });

    // Total questions
    const totalQuestions = await prisma.question.count({
      where: {
        session: {
          teacher_id: parseInt(teacherId)
        }
      }
    });

    // Sessions with question details
    const sessions = await prisma.session.findMany({
      where: {
        teacher_id: parseInt(teacherId)
      },
      include: {
        questions: true,
        _count: {
          select: {
            questions: true
          }
        }
      },
      orderBy: {
        started_at: "desc"
      }
    });

    // Calculate answered questions
    let answeredQuestions = 0;

    sessions.forEach(session => {
      answeredQuestions += session.questions.filter(
        q => q.is_answered
      ).length;
    });

    // Answer rate
    const answerRate =
      totalQuestions === 0
        ? 0
        : ((answeredQuestions / totalQuestions) * 100).toFixed(1);

    // Session breakdown
    const sessionBreakdown = sessions.map(session => {
      const answered = session.questions.filter(
        q => q.is_answered
      ).length;

      const topQuestion = session.questions.sort(
        (a, b) => b.upvotes - a.upvotes
      )[0];

      return {
        id: session.id,
        title: session.title,
        date: session.started_at,
        totalQuestions: session._count.questions,
        answered,
        answerRate:
          session._count.questions === 0
            ? 0
            : (
                (answered / session._count.questions) *
                100
              ).toFixed(1),

        topQuestion: topQuestion
          ? {
              text: topQuestion.question_text,
              upvotes: topQuestion.upvotes
            }
          : null
      };
    });

    res.json({
      overallStats: {
        totalSessions,
        totalQuestions,
        answerRate
      },
      sessionBreakdown
    });

  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({
      error: "Internal server error"
    });
  }
};