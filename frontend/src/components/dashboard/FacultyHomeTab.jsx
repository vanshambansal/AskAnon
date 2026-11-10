import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
// Presentation only: Dashboard owns state, effects, and event handlers.
export default function FacultyHomeTab({
  activeRooms,
  pendingActions,
  setShowCreate,
  copyRoomLink,
  getElapsedTime,
  navigate,
  handleEndSession,
  triggerDeleteSession,
  endedSessions,
  setActiveTab
}) {
  return (
    <div className="faculty-overview-view">

      {/* HERO: Active Rooms */}
      <div className="faculty-sub-section">
        <div className="section-title-row">
          <h2 className="dash-section-title">
            {activeRooms.length > 0 && <span className="live-pulse-dot">●</span>} Active Rooms
          </h2>
          {activeRooms.length > 0 && (
            <span className="section-pill">{activeRooms.length} Live Now</span>
          )}
        </div>

        {activeRooms.length === 0 ? (
          <div className="no-lectures-empty-state">
            <div className="no-lectures-icon"><Icon name="lecture" /></div>
            <h3 className="no-lectures-title">NO ACTIVE LECTURES</h3>
            <p className="no-lectures-sub">You aren't running a live lecture right now.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Start Instant Lecture
            </button>
          </div>
        ) : (
          <div className="faculty-active-rooms-grid">
            {activeRooms.map(s => {
              const roomQuestions = s.questions || []
              const ansCount = roomQuestions.filter(q => q.is_answered || q.status === 'ANSWERED').length
              const opnCount = roomQuestions.length - ansCount

              return (
                <div key={s.id} className="active-hall-card fade-up">
                  <div className="active-hall-top">
                    <div className="active-hall-badges">
                      <span className="live-status-pill">
                        <span className="live-status-dot" /> LIVE
                      </span>
                      {s.course?.course_code && (
                        <span className="active-hall-course">{s.course.course_code}</span>
                      )}
                      <span className="active-hall-code">#{s.session_code}</span>
                    </div>
                    <button
                      className="active-hall-copy-btn"
                      onClick={() => copyRoomLink(s.session_code)}
                      title="Copy direct student join link"
                    >
                      <Icon name="copy" /> Copy Link
                    </button>
                  </div>

                  <div className="active-hall-info">
                    <h3 className="active-hall-title">{s.title}</h3>
                    {s.subject && <p className="active-hall-subject">{s.subject}</p>}
                  </div>

                  <div className="active-hall-stats">
                    <div className="active-hall-stat-item">
                      <span className="stat-icon"><Icon name="clock" /></span>
                      <span className="stat-text">{getElapsedTime(s.started_at)}</span>
                    </div>
                    <div className="active-hall-stat-item">
                      <span className="stat-icon"><Icon name="message" /></span>
                      <span className="stat-text">{roomQuestions.length} Questions</span>
                    </div>
                    <div className="active-hall-stat-item">
                      <span className="stat-icon">✓</span>
                      <span className="stat-text">{ansCount} Answered</span>
                    </div>
                    {opnCount > 0 && (
                      <div className="active-hall-stat-item alert">
                        <span className="stat-icon">●</span>
                        <span className="stat-text">{opnCount} Open</span>
                      </div>
                    )}
                  </div>

                  <div className="active-hall-actions">
                    <button
                      className="btn btn-primary active-hall-enter-btn"
                      onClick={() => navigate(`/session/${s.session_code}?role=teacher`)}
                    >
                      Enter Live Console →
                    </button>
                    <div className="active-hall-secondary-actions">
                      <BusyButton busy={pendingActions.has(`end:${s.id}`)}
                        className="btn btn-secondary btn-sm active-hall-end-btn"
                        onClick={() => handleEndSession(s)}
                        title="Conclude lecture and generate recap"
                      >
                        End Lecture
                      </BusyButton>
                      <button
                        className="btn btn-ghost btn-sm active-hall-delete-btn"
                        onClick={() => triggerDeleteSession(s)}
                        title="Delete room"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Lecture History (compact rows) */}
      {endedSessions.length > 0 && (
        <div className="faculty-sub-section">
          <div className="section-title-row">
            <h2 className="dash-section-title">Recent Lecture History</h2>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setActiveTab('sessions')}
            >
              View All ({endedSessions.length}) →
            </button>
          </div>

          <div className="recent-history-list">
            {endedSessions.slice(0, 5).map(s => {
              const qCount = s._count?.questions || s.questions?.length || 0
              const ansCount = (s.questions || []).filter(q => q.is_answered || q.status === 'ANSWERED').length

              return (
                <div key={s.id} className="history-row">
                  <div className="history-row-left">
                    {s.course?.course_code && (
                      <span className="history-course-badge">{s.course.course_code}</span>
                    )}
                    <span className="history-row-title">{s.title}</span>
                    <span className="history-row-code">#{s.session_code}</span>
                  </div>
                  <div className="history-row-center">
                    <span className="history-row-meta">
                      <Icon name="message" /> {qCount} · ✓ {ansCount}
                    </span>
                    <span className="history-row-date">
                      {new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="history-row-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`/session/${s.session_code}/recap`)}
                    >
                      Recap →
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => triggerDeleteSession(s)}
                      title="Delete"
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
