import ProgressiveList from '../common/ProgressiveList'
import Icon from '../common/Icon'

export default function FacultySessionsTab({
  filteredSessions, sessions, sessionEditMode, setSessionEditMode, setSelectedSessions,
  sessionSearch, setSessionSearch, sessionCourseFilter, setSessionCourseFilter,
  courses, sessionStatusFilter, setSessionStatusFilter, sessionSort, setSessionSort,
  selectedSessions, selectAllFiltered, setShowBatchDeleteModal, toggleSelectSession,
  copyRoomLink, setTaggingSession, navigate, triggerDeleteSession
}) {
  const resetFilters = () => { setSessionSearch(''); setSessionCourseFilter('all'); setSessionStatusFilter('all') }
  return <section className="faculty-sub-section session-index">
    <div className="section-title-row">
      <div><h2 className="dash-section-title">Lecture sessions</h2><p className="session-index-description">Open a live room or revisit a completed lecture.</p></div>
      <button className="btn btn-ghost btn-sm" onClick={() => { setSessionEditMode(value => !value); setSelectedSessions([]) }}>{sessionEditMode ? 'Done selecting' : 'Select sessions'}</button>
    </div>
    <div className="session-search-dock">
      <label className="session-search-field"><span className="sr-only">Search sessions</span><Icon name="search" /><input className="input" placeholder="Search title, subject or room code" value={sessionSearch} onChange={e => setSessionSearch(e.target.value)} /></label>
      <label>Course<select className="input" value={sessionCourseFilter} onChange={e => setSessionCourseFilter(e.target.value)}><option value="all">All courses</option>{courses.map(course => <option value={course.id} key={course.id}>{course.course_code}</option>)}<option value="unassigned">Unassigned</option></select></label>
      <label>Status<select className="input" value={sessionStatusFilter} onChange={e => setSessionStatusFilter(e.target.value)}><option value="all">All sessions</option><option value="live">Live</option><option value="ended">Completed</option></select></label>
      <label>Sort<select className="input" value={sessionSort} onChange={e => setSessionSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="questions">Most questions</option></select></label>
    </div>
    <div className="session-list-summary"><span>{filteredSessions.length} {filteredSessions.length === 1 ? 'session' : 'sessions'}</span>{sessionEditMode && <button className="btn btn-ghost btn-sm" onClick={selectAllFiltered}>Select all matching</button>}{(sessionSearch || sessionCourseFilter !== 'all' || sessionStatusFilter !== 'all') && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Clear filters</button>}</div>
    {sessionEditMode && selectedSessions.length > 0 && <div className="session-selection-bar"><span>{selectedSessions.length} selected</span><button className="btn btn-secondary btn-sm" onClick={() => setShowBatchDeleteModal(true)}><Icon name="trash" /> Delete selected</button><button className="btn btn-ghost btn-sm" onClick={() => setSelectedSessions([])}>Clear selection</button></div>}
    {!filteredSessions.length ? <div className="empty-panel card"><Icon name="lecture" /><h3>No sessions found</h3><p>{sessions.length ? 'Try a different search or filter.' : 'Start a lecture to create your first room.'}</p></div> :
      <div className="session-list" role="table" aria-label="Hosted lecture sessions">
        <div className="session-list-head" role="row">{['Session', 'Course', 'Discussion', 'Created', 'Actions'].map(label => <span role="columnheader" key={label}>{label}</span>)}</div>
        <ProgressiveList items={filteredSessions} key={JSON.stringify([sessionSearch, sessionCourseFilter, sessionStatusFilter, sessionSort])}>{visible => <>{visible.map(session => {
          const questions = session._count?.questions ?? session.questions?.length ?? 0
          const answered = (session.questions || []).filter(question => question.is_answered || question.status === 'ANSWERED').length
          const started = new Date(session.started_at)
          return <div className="session-list-row" role="row" key={session.id}>
            <div className="session-list-identity" role="cell">
              {sessionEditMode && <input type="checkbox" checked={selectedSessions.includes(session.id)} onChange={() => toggleSelectSession(session.id)} aria-label={`Select ${session.title}`} />}
              <div><div className="session-list-title"><span className={`session-state ${session.is_active ? 'live' : ''}`}>{session.is_active ? 'Live' : 'Completed'}</span><h3>{session.title}</h3></div>
                {session.subject && session.subject.trim().toLowerCase() !== session.title.trim().toLowerCase() && <p>{session.subject}</p>}
                <button className="session-room-code" onClick={() => copyRoomLink(session.session_code)} title="Copy student join link"><Icon name="copy" /> {session.session_code}</button>
              </div>
            </div>
            <div role="cell" data-label="Course"><button className="session-course-link" title="Change course assignment" onClick={() => setTaggingSession(session)}>{session.course?.course_code || 'Assign course'}</button></div>
            <div className="session-list-count" role="cell" data-label="Discussion"><span>{questions} {questions === 1 ? 'question' : 'questions'}</span><small>{answered} answered</small></div>
            <time role="cell" data-label="Created" dateTime={session.started_at}><span>{started.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span><small>{started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></time>
            <div className="session-list-actions" role="cell"><button className={`btn btn-sm ${session.is_active ? 'btn-primary' : 'btn-secondary'}`} onClick={() => navigate(session.is_active ? `/session/${session.session_code}?role=teacher` : `/session/${session.session_code}/recap`)}>{session.is_active ? 'Open room' : 'View recap'}</button><button className="btn btn-ghost btn-sm" onClick={() => triggerDeleteSession(session)} title="Delete session" aria-label={`Delete ${session.title}`}><Icon name="trash" /></button></div>
          </div>
        })}</>}</ProgressiveList>
      </div>}
  </section>
}
