import { createPortal } from 'react-dom'
import ProgressiveList from '../common/ProgressiveList'
import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
// Presentation only: Dashboard owns state, effects, and event handlers.
export default function FacultyCoursesTab({
  setShowCreateCourse,
  courseSearch,
  setCourseSearch,
  filteredTeacherCourses,
  courses,
  navigate,
  setUploadingForCourse,
  uploadingForCourse,
  uploadTitle,
  setUploadTitle,
  uploadCategory,
  setUploadCategory,
  setUploadFile,
  handleUploadCourseMaterial,
  isUploading
}) {
  return (
    <div className="faculty-sub-section">
      <div className="section-title-row">
        <div>
          <h2 className="dash-section-title">Course Repositories</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Manage course vaults, upload lecture materials, and organize sessions.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateCourse(true)}>
          + New Course
        </button>
      </div>

      {/* Course Search */}
      <div className="sessions-toolbar" style={{ marginBottom: '24px' }}>
        <div className="sessions-search-box" style={{ flex: 1 }}>
          <span className="search-icon"><Icon name="search" /></span>
          <input
            type="text"
            className="session-search-input"
            placeholder="Search by course code, title, or keywords…"
            value={courseSearch}
            onChange={e => setCourseSearch(e.target.value)}
          />
          {courseSearch && (
            <button className="clear-search-btn" onClick={() => setCourseSearch('')}>✕</button>
          )}
        </div>
        <div className="sessions-filters-row">
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {filteredTeacherCourses.length} of {courses.length} courses
          </span>
        </div>
      </div>

      {/* Courses Grid */}
      {filteredTeacherCourses.length === 0 ? (
        <div className="empty-panel card">
          <span className="empty-panel-icon"><Icon name="folder" /></span>
          <h3>No course repositories found</h3>
          <p>
            {courses.length === 0
              ? 'Create your first course repository to organize lectures and study materials.'
              : `No courses match "${courseSearch}".`}
          </p>
          {courseSearch ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setCourseSearch('')}>
              Clear Search
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreateCourse(true)}>
              + New Course
            </button>
          )}
        </div>
      ) : (
        <div className="faculty-courses-grid">
          <ProgressiveList items={filteredTeacherCourses} key={courseSearch}>{visibleItems => <>{visibleItems.map(course => (
            <div key={course.id} className="faculty-course-card">
              <div className="course-card-inner">
                <div className="course-card-header">
                  <span className="course-row-code">{course.course_code}</span>
                </div>
                <h3 className="course-row-title">{course.title}</h3>
                {course.description && (
                  <p className="course-row-desc">{course.description}</p>
                )}
                <div className="course-row-counts">
                  <span><Icon name="book" /> {course._count?.materials || 0} resources</span>
                  <span><Icon name="lecture" /> {course._count?.sessions || 0} Sessions</span>
                </div>
              </div>

              <div className="faculty-course-card-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate(`/courses/${course.id}`)}
                >
                  Open Vault →
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setUploadFile(null); setUploadTitle(''); setUploadCategory('Lecture Slides'); setUploadingForCourse(course.id) }}
                >
                  Attach material
                </button>
              </div>


            </div>
          ))}</>}</ProgressiveList>
        </div>
      )}
      {uploadingForCourse && createPortal(<div className="modal-backdrop theme-faculty" onClick={() => !isUploading && setUploadingForCourse(null)}><div className="modal-content" onClick={event => event.stopPropagation()}><h2>Attach course material</h2><p className="modal-sub">{courses.find(course => course.id === uploadingForCourse)?.title}. Choose a PDF or image, up to 25 MB.</p>
                  <form className="upload-fields" onSubmit={event => { event.preventDefault(); if (!isUploading) handleUploadCourseMaterial(uploadingForCourse) }}>
                    <input
                      type="text"
                      className="input"
                      aria-label="Material title" placeholder="Title (e.g. Lecture 12 Slides)"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                    />
                    <select
                      className="input"
                      aria-label="Material category" value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                    >
                      <option value="Lecture Slides">Lecture Slides</option>
                      <option value="Notes">Notes</option>
                      <option value="Assignments">Assignments</option>
                      <option value="Problem Sheet">Problem Sheet</option>
                    </select>
                    <input
                      type="file" aria-label="Material file"
                      accept=".pdf,image/*"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                    />
                    <div className="modal-actions"><button type="button" className="btn btn-ghost" disabled={isUploading} onClick={() => setUploadingForCourse(null)}>Cancel</button><BusyButton busy={isUploading}
                      className="btn btn-primary btn-sm"
                      type="submit"
                      disabled={isUploading}
                    >
                      {isUploading ? 'Uploading…' : 'Upload to Vault →'}
                    </BusyButton></div>
                  </form>
      </div></div>, document.body)}
    </div>
  )
}
