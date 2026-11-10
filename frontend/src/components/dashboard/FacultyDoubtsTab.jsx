import ProgressiveList from '../common/ProgressiveList'
import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
// Presentation only: Dashboard owns state, effects, and event handlers.
export default function FacultyDoubtsTab({
  pendingActions,
  unresolvedDoubts,
  doubtsCourseFilter,
  setDoubtsCourseFilter,
  courses,
  doubtsSessionFilter,
  setDoubtsSessionFilter,
  sessions,
  filteredDoubts,
  stripInstructorPrefix,
  handleMarkAnswered,
  navigate
}) {
  return (
    <div className="faculty-sub-section">
      <div className="section-title-row">
        <div>
          <h2 className="dash-section-title">Unresolved Student Doubts</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Review and resolve questions from all your lectures.
          </p>
        </div>
        <span className="section-pill">{unresolvedDoubts.length} Pending</span>
      </div>

      {/* Doubts Filters */}
      {unresolvedDoubts.length > 0 && (
        <div className="sessions-toolbar" style={{ marginBottom: '20px' }}>
          <div className="sessions-filters-row">
            <div className="filter-group">
              <label>Course:</label>
              <select
                className="filter-select"
                value={doubtsCourseFilter}
                onChange={e => setDoubtsCourseFilter(e.target.value)}
              >
                <option value="all">All Courses</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.course_code} — {c.title}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Session:</label>
              <select
                className="filter-select"
                value={doubtsSessionFilter}
                onChange={e => setDoubtsSessionFilter(e.target.value)}
              >
                <option value="all">All Sessions</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title} #{s.session_code}
                  </option>
                ))}
              </select>
            </div>

            {(doubtsCourseFilter !== 'all' || doubtsSessionFilter !== 'all') && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setDoubtsCourseFilter('all'); setDoubtsSessionFilter('all') }}
              >
                Clear Filters
              </button>
            )}

            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filteredDoubts.length} of {unresolvedDoubts.length} shown
            </span>
          </div>
        </div>
      )}

      {/* Doubts List */}
      {unresolvedDoubts.length === 0 ? (
        <div className="empty-panel success-panel">
          <span className="empty-panel-icon">✓</span>
          <h3>All caught up!</h3>
          <p>All student doubts across your lectures have been addressed.</p>
        </div>
      ) : filteredDoubts.length === 0 ? (
        <div className="empty-panel card">
          <span className="empty-panel-icon"><Icon name="message" /></span>
          <p>No doubts match your current filters.</p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setDoubtsCourseFilter('all'); setDoubtsSessionFilter('all') }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="unresolved-doubts-list">
          <ProgressiveList items={filteredDoubts} key={doubtsCourseFilter + doubtsSessionFilter}>{visibleItems => <>{visibleItems.map(q => {
            const displayText = stripInstructorPrefix(q.question_text)
            const isInstructorNote = q.question_text?.startsWith('👨‍🏫')

            return (
              <div key={q.id} className="doubt-item-card">
                <div className="doubt-upvote-box">
                  <span className="doubt-upvote-arrow">▲</span>
                  <span className="doubt-upvote-num">{q.upvotes}</span>
                </div>
                <div className="doubt-body">
                  {isInstructorNote ? (
                    <p className="doubt-text doubt-text-broadcast">
                      <Icon name="user" /> <em>Instructor broadcast</em>
                      {displayText && `: "${displayText}"`}
                    </p>
                  ) : (
                    <p className="doubt-text">
                      {displayText || (q.code_snippet ? '</> Code Attachment' : 'Image Attachment')}
                    </p>
                  )}
                  <div className="doubt-meta-row">
                    <span className="doubt-course-tag">{q.courseCode}</span>
                    <span className="doubt-session-tag">#{q.sessionCode}</span>
                    <span className="doubt-title-tag">{q.sessionTitle}</span>
                    <span className="doubt-time-tag">
                      {new Date(q.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
                <div className="doubt-actions">
                  <BusyButton busy={pendingActions.has(`answer:${q.id}`)}
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMarkAnswered(q.id)}
                  >
                    ✓ Mark Answered
                  </BusyButton>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/session/${q.sessionCode}/recap`)}
                  >
                    Recap →
                  </button>
                </div>
              </div>
            )
          })}</>}</ProgressiveList>
        </div>
      )}
    </div>
  )
}
