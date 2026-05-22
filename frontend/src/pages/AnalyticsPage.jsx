import { useEffect, useState } from "react";
import axios from "axios";

const AnalyticsPage = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const teacherId = 1; // replace later dynamically

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/analytics/teacher/${teacherId}`

        );

        setAnalytics(res.data);

      } catch (err) {
        console.error("Analytics fetch error:", err);

      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) return <h2>Loading...</h2>;

  return (
    <div className="p-6">

      <h1 className="text-3xl font-bold mb-6">
        Teacher Analytics Dashboard
      </h1>

      {/* Overall Stats */}

      <div className="grid grid-cols-3 gap-4 mb-8">

        <div className="border p-4 rounded">
          <h2 className="text-lg font-semibold">
            Sessions
          </h2>

          <p className="text-2xl">
            {analytics.overallStats.totalSessions}
          </p>
        </div>

        <div className="border p-4 rounded">
          <h2 className="text-lg font-semibold">
            Questions
          </h2>

          <p className="text-2xl">
            {analytics.overallStats.totalQuestions}
          </p>
        </div>

        <div className="border p-4 rounded">
          <h2 className="text-lg font-semibold">
            Answer Rate
          </h2>

          <p className="text-2xl">
            {analytics.overallStats.answerRate}%
          </p>
        </div>

      </div>

      {/* Session Breakdown */}

      <div>

        <h2 className="text-2xl font-bold mb-4">
          Session Breakdown
        </h2>

        <table className="w-full border">

          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Session</th>
              <th className="border p-2">Questions</th>
              <th className="border p-2">Answered</th>
              <th className="border p-2">Answer Rate</th>
              <th className="border p-2">Top Question</th>
            </tr>
          </thead>

          <tbody>

            {analytics.sessionBreakdown.map((session) => (
              <tr key={session.id}>

                <td className="border p-2">
                  {session.title}
                </td>

                <td className="border p-2">
                  {session.totalQuestions}
                </td>

                <td className="border p-2">
                  {session.answered}
                </td>

                <td className="border p-2">
                  {session.answerRate}%
                </td>

                <td className="border p-2">
                  {session.topQuestion
                    ? `${session.topQuestion.text} ▲${session.topQuestion.upvotes}`
                    : "No questions"}
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default AnalyticsPage;