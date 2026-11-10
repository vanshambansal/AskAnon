import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
// Presentation only: Dashboard owns state, effects, and event handlers.
export default function DashboardModals({
  pendingActions,
  showCreate,
  setShowCreate,
  form,
  setForm,
  courses,
  createSession,
  creating,
  showCreateCourse,
  setShowCreateCourse,
  courseForm,
  setCourseForm,
  createCourse,
  creatingCourse,
  sessionToDelete,
  setSessionToDelete,
  deleting,
  confirmDeleteSession,
  showBatchDeleteModal,
  setShowBatchDeleteModal,
  selectedSessions,
  isBatchDeleting,
  handleBatchDelete,
  taggingSession,
  setTaggingSession,
  handleAssignCourse,
  courseToLeave,
  setCourseToLeave,
  confirmLeaveCourse
}) {
  return (
    <>
      {/*  MODAL: CREATE SESSION  */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => !(creating) && setShowCreate(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Start Instant Lecture Room</h2>
            <p className="modal-sub">Launch a room code for your students to join instantly.</p>

            <div className="form-group">
              <label>Lecture Topic / Title *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. CPU Scheduling & Concurrency"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Subject / Notes</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Operating Systems CS301"
                value={form.subject}
                onChange={e => setForm({ ...form, subject: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Link to Course Vault (Optional)</label>
              <select
                className="input"
                value={form.course_id}
                onChange={e => setForm({ ...form, course_id: e.target.value })}
              >
                <option value="">No course - standalone lecture</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.course_code} - {c.title}</option>
                ))}
              </select>
            </div>

            {!form.course_id && <p className="modal-sub">Starts as a standalone lecture. Uploading a resource or saving a diagram creates or reuses your General Lectures &amp; Sessions vault and links this lecture to it.</p>}
            <div className="modal-actions">
              <button disabled={creating} className="btn btn-ghost" onClick={() => !(creating) && setShowCreate(false)}>Cancel</button>
              <BusyButton busy={creating} className="btn btn-primary" onClick={createSession} disabled={creating || !form.title.trim()}>
                {creating ? 'Starting Session…' : 'Launch Live Room →'}
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/*  MODAL: CREATE COURSE  */}
      {showCreateCourse && (
        <div className="modal-backdrop" onClick={() => !(creatingCourse) && setShowCreateCourse(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Create Course Repository</h2>
            <p className="modal-sub">Organize lectures and lecture materials by course code.</p>

            <div className="form-group">
              <label>Course Code *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. CS301"
                value={courseForm.course_code}
                onChange={e => setCourseForm({ ...courseForm, course_code: e.target.value })}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Course Title *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Operating Systems"
                value={courseForm.title}
                onChange={e => setCourseForm({ ...courseForm, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Fall 2026 Core Computer Science requirement"
                value={courseForm.description}
                onChange={e => setCourseForm({ ...courseForm, description: e.target.value })}
              />
            </div>

            <div className="modal-actions">
              <button disabled={creatingCourse} className="btn btn-ghost" onClick={() => !(creatingCourse) && setShowCreateCourse(false)}>Cancel</button>
              <BusyButton busy={creatingCourse}
                className="btn btn-primary"
                onClick={createCourse}
                disabled={creatingCourse || !courseForm.course_code.trim() || !courseForm.title.trim()}
              >
                {creatingCourse ? 'Creating…' : 'Create Course →'}
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/*  MODAL: CONFIRM DELETE SESSION  */}
      {sessionToDelete && (
        <div className="modal-backdrop" onClick={() => !(pendingActions.has('delete')) && setSessionToDelete(null)}>
          <div className="modal-content academic-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-danger-header">
              <span className="danger-icon"><Icon name="spark" /></span>
              <div>
                <h2>Delete Lecture Session?</h2>
                <p className="modal-sub">
                  Room #{sessionToDelete.session_code} — {sessionToDelete.title}
                </p>
              </div>
            </div>

            {sessionToDelete.is_active ? (
              <div className="delete-alert-box live-alert">
                <strong>Active Lecture Room Warning:</strong> This room is currently LIVE. Deleting it will immediately terminate the room and disconnect all attending students.
              </div>
            ) : (
              <div className="delete-alert-box">
                This will permanently remove the question ledger, student votes, and lecture recap for this session.
              </div>
            )}

            <div className="delete-safe-notice">
              <span className="safe-icon"><Icon name="spark" /></span>
              <div className="safe-text">
                <strong>Course Materials Preserved:</strong>
                <p>Any PDF slides, notes, or handouts uploaded during this lecture will remain safely stored in your Course Vault.</p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => !(pendingActions.has('delete')) && setSessionToDelete(null)}
                disabled={deleting === sessionToDelete.id}
              >
                Cancel
              </button>
              <BusyButton busy={deleting === sessionToDelete.id}
                type="button"
                className="btn btn-primary btn-danger"
                onClick={confirmDeleteSession}
                disabled={deleting === sessionToDelete.id}
              >
                {deleting === sessionToDelete.id ? 'Queueing deletion…' : 'Yes, Delete Session'}
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/*  MODAL: BATCH DELETE CONFIRMATION  */}
      {showBatchDeleteModal && (
        <div className="modal-backdrop" onClick={() => !(isBatchDeleting) && setShowBatchDeleteModal(false)}>
          <div className="modal-content academic-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-danger-header">
              <span className="danger-icon"><Icon name="spark" /></span>
              <div>
                <h2>Delete {selectedSessions.length} Sessions?</h2>
                <p className="modal-sub">
                  Batch removal of selected lecture rooms and question ledgers.
                </p>
              </div>
            </div>

            <div className="delete-alert-box live-alert">
              <strong>Permanent Action:</strong> This will delete {selectedSessions.length} lecture sessions and all associated student questions and votes.
            </div>

            <div className="delete-safe-notice">
              <span className="safe-icon"><Icon name="spark" /></span>
              <div className="safe-text">
                <strong>Course Materials Preserved:</strong>
                <p>Any PDF lecture slides or study handouts attached to these sessions will remain safely stored in your Course Vaults.</p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => !(isBatchDeleting) && setShowBatchDeleteModal(false)}
                disabled={isBatchDeleting}
              >
                Cancel
              </button>
              <BusyButton busy={isBatchDeleting}
                type="button"
                className="btn btn-primary btn-danger"
                onClick={handleBatchDelete}
                disabled={isBatchDeleting}
              >
                {isBatchDeleting ? 'Queueing deletions…' : `Yes, Delete ${selectedSessions.length} Sessions`}
              </BusyButton>
            </div>
          </div>
        </div>
      )}


      {/*  MODAL: ASSIGN / CHANGE COURSE  */}
      {taggingSession && (
        <div className="modal-backdrop" onClick={() => !(pendingActions.has('assign')) && setTaggingSession(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Assign Lecture to Course</h2>
            <p className="modal-sub">
              Link room #{taggingSession.session_code} ("{taggingSession.title}") to an academic course repository.
            </p>

            <div className="form-group">
              <label>Select Course</label>
              <select
                className="input"
                defaultValue={taggingSession.course_id || ''}
                disabled={pendingActions.has('assign')}
                aria-busy={pendingActions.has('assign')}
                onChange={e => handleAssignCourse(taggingSession.id, e.target.value)}
              >
                <option value="">-- No Course (Unassigned) --</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.course_code} - {c.title}</option>
                ))}
              </select>
            </div>

            {pendingActions.has('assign') && <p role="status"><span className="operation-spinner" />Saving course assignment...</p>}
            <div className="modal-actions">
              <button disabled={pendingActions.has('assign')} className="btn btn-ghost" onClick={() => !(pendingActions.has('assign')) && setTaggingSession(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  MODAL: CONFIRM LEAVE COURSE  */}
      {courseToLeave && (
        <div className="modal-backdrop" onClick={() => !(pendingActions.has('leave')) && setCourseToLeave(null)}>
          <div className="modal-content academic-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-danger-header">
              <span className="danger-icon"><Icon name="spark" /></span>
              <div>
                <h2>Leave Course Repository?</h2>
                <p className="modal-sub">
                  {courseToLeave.course_code} — {courseToLeave.title}
                </p>
              </div>
            </div>

            <div className="delete-alert-box">
              You will no longer receive live lecture notifications or have access to this course's slide vault and lecture materials.
            </div>

            <div className="modal-actions">
              <button disabled={pendingActions.has('leave')}
                type="button"
                className="btn btn-ghost"
                onClick={() => !(pendingActions.has('leave')) && setCourseToLeave(null)}
              >
                Cancel
              </button>
              <BusyButton busy={pendingActions.has('leave')}
                type="button"
                className="btn btn-primary btn-danger"
                onClick={confirmLeaveCourse}
              >
                Yes, Leave Course
              </BusyButton>
            </div>
          </div>
        </div>
      )}


</>
  )
}
