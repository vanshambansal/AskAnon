import ProgressiveList from '../components/common/ProgressiveList'
import { readResource, peekResource, invalidateResources, resourceVersion } from '../utils/resourceCache.mjs'
import usePendingActions from '../hooks/usePendingActions'
import { BusyButton, PageSkeleton } from '../components/common/AsyncFeedback'
import LightboxModal from '../components/session/LightboxModal'
import Icon from '../components/common/Icon'
import VaultAssistant from '../components/course/VaultAssistant'
import useWorkspaceUpdates from '../hooks/useWorkspaceUpdates'
import { useState, useEffect, useEffectEvent, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, useUser, UserButton } from '@clerk/clerk-react'
import axios from 'axios'
import { downloadFile } from '../utils/downloadHelper'
import './CourseDetail.css'

const API = import.meta.env.VITE_API_URL
let nextRequestId = 0

export default function CourseDetail() {
  const { id } = useParams()
  const { user } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { pending: pendingActions, run: runAction } = usePendingActions()

  const loadRequest = useRef(0)
  const [course, setCourse] = useState(null)
  const [dbUser, setDbUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('db_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [activeTab, setActiveTab] = useState('materials') // 'overview' | 'materials' | 'sessions'
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState(null)

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('Lecture Slides')
  const [uploadFile, setUploadFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef(null)

  // In-app deletion modal state
  const [materialToDelete, setMaterialToDelete] = useState(null)

  const [expandedImage, setExpandedImage] = useState(null)
  const [indexingId, setIndexingId] = useState(null)
  const [assistantScope, setAssistantScope] = useState('all')
  const aiRequest = useRef(null)
  useEffect(() => () => { aiRequest.current?.abort(); aiRequest.current = null }, [id])

  // Course-wide AI Assistant state
  const [courseAiQuery, setCourseAiQuery] = useState('')
  const [courseAiResponse, setCourseAiResponse] = useState(null)
  const [conversation, setConversation] = useState([])
  const [courseAiLoading, setCourseAiLoading] = useState(false)

  const initialize = useEffectEvent(() => loadCourseData())
  useEffect(() => {
    if (user) initialize()
    return () => { loadRequest.current = ++nextRequestId }
  }, [id, user])

  useWorkspaceUpdates({
    onChange: event => { if (!event.courseId || event.courseId === Number(id)) loadCourseData(true) },
    onCourseDeleted: courseId => { if (courseId === Number(id)) { loadRequest.current = ++nextRequestId; setCourse(null); setLoadError('This course was deleted by its owner.'); setLoading(false) } }
  })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadCourseData = async (quiet = false) => {
    const request = ++nextRequestId
    loadRequest.current = request
    const cacheKey = `course:${user.id}:${dbUser?.role || 'unknown'}:${id}`
    const savedCourse = peekResource(cacheKey)
    if (savedCourse) { setCourse(savedCourse); setLoading(false) }
    else if (quiet !== true) setLoading(true)
    setLoadError('')
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}

      if (!token) throw new Error('Please sign in to open this course');
      let cached = null
      try { cached = JSON.parse(sessionStorage.getItem('db_user') || 'null') } catch { /* Resync an invalid profile cache. */ }
      if (cached?.clerk_user_id === user.id) setDbUser(cached)
      else {
        const syncRes = await axios.post(`${API}/api/users/sync`, {}, { headers })
        setDbUser(syncRes.data)
        sessionStorage.setItem('db_user', JSON.stringify(syncRes.data))
      }
      const version = resourceVersion()
      const courseData = await readResource(cacheKey, async () => (await axios.get(`${API}/api/courses/${id}`, { headers })).data, { fresh: quiet === true || Boolean(savedCourse) });
      if (request !== loadRequest.current || version !== resourceVersion()) return
      if (course?.id !== courseData.id) { setCourseAiResponse(null); setAssistantScope('all'); setCourseAiQuery(''); setCourseAiLoading(false); setConversation([]) }
      setCourse(courseData);
    } catch (err) {
      if (request !== loadRequest.current) return
      console.error('Failed to load course:', err)
      if ([401, 403, 404].includes(err.response?.status)) { setCourse(null); invalidateResources() }
      if (!quiet && !savedCourse) setCourse(null)
      setLoadError(err.response?.data?.error || 'Unable to open this course. Please retry.')
    } finally {
      if (request === loadRequest.current) setLoading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (isUploading) return
    if (!uploadFile) {
      setUploadError('Please select a file to upload')
      return
    }
    if (!uploadTitle.trim()) {
      setUploadError('Please provide a title for the resource')
      return
    }
    if (uploadFile.size > 25 * 1024 * 1024) {
      setUploadError('Choose a file smaller than 25 MB')
      return
    }

    setIsUploading(true)
    setUploadError('')

    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('title', uploadTitle.trim())
      formData.append('category', uploadCategory)
      formData.append('course_id', id)
      formData.append('file', uploadFile)

      const res = await axios.post(`${API}/api/materials/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      })

      setCourse(prev => ({
        ...prev,
        materials: [res.data, ...(prev.materials || []).filter(material => material.id !== res.data.id)]
      }))

      setShowUpload(false)
      setUploadFile(null)
      setUploadTitle('')
      if (fileRef.current) fileRef.current.value = ''
      showToast('Material added to course study vault!')
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(err.response?.data?.error || 'Failed to upload material')
    } finally {
      setIsUploading(false)
    }
  }

  const confirmDeleteMaterial = async () => {
    return runAction('delete-material', async () => {
      if (!materialToDelete) return
      const materialId = materialToDelete.id
      try {
        const token = await getToken()
        await axios.delete(`${API}/api/materials/${materialId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setCourse(prev => ({
          ...prev,
          materials: prev.materials.filter(m => m.id !== materialId)
        }))
        setMaterialToDelete(null)
        showToast('Material deleted from course vault')
      } catch (err) {
        console.error('Delete material error:', err)
        showToast('Failed to delete material', 'error')
      }

    })
  }

  const handleRetryIndex = async materialId => {
    setIndexingId(materialId)
    try {
      const token = await getToken()
      await axios.post(`${API}/api/materials/${materialId}/index`, {}, { headers: { Authorization: `Bearer ${token}` } })
      showToast('Indexing requested. Status will update automatically.')
    } catch (err) { showToast(err.response?.data?.error || 'Could not start indexing.', 'error') }
    finally { setIndexingId(null) }
  }

  const handleAskCourse = async (e, suggestedQuestion, mode = 'ask') => {
    if (e && e.preventDefault) e.preventDefault()
    const query = (suggestedQuestion ?? courseAiQuery).trim()
    if (suggestedQuestion) setCourseAiQuery(query)
    if (!query || aiRequest.current) return
    const controller = new AbortController()
    aiRequest.current = controller

    setCourseAiLoading(true)
    setCourseAiResponse(null)

    try {
      const token = await getToken()
      const res = await axios.post(assistantScope === 'all' ? `${API}/api/courses/${id}/ask` : `${API}/api/materials/${assistantScope}/ask`,
        { question: query, mode, history: conversation.slice(-3).map(turn => ({ question: turn.question, answer: (turn.answer + (turn.practice?.length ? '\nPractice: ' + JSON.stringify(turn.practice) : '')).slice(0, 6000) })) },
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal }
      )
      if (!controller.signal.aborted) {
        const turn = { ...res.data, question: query }
        setCourseAiResponse(turn)
        setConversation(previous => [...previous, turn].slice(-8))
        setCourseAiQuery('')
      }
    } catch (err) {
      if (controller.signal.aborted) return
      console.error('Ask course error:', err)
      setCourseAiResponse({
        answer: err.response?.data?.answer || err.response?.data?.error || 'Failed to analyze course materials. Please try again later.',
        question: query, mode, sources: err.response?.data?.sources || [], evidence: err.response?.data?.evidence || [], error: true
      })
    } finally {
      if (aiRequest.current === controller) { aiRequest.current = null; setCourseAiLoading(false) }
    }
  }

  if (loading) return <PageSkeleton label="Opening course study vault..." />

  if (loadError && !course) {
    return (
      <main className="loading-screen" style={{ flexDirection: 'column', gap: 16, padding: 24 }}>
        <h1>Course unavailable</h1>
        <p role="alert">{loadError}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={loadCourseData}>Retry</button>
          <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </div>
      </main>
    )
  }

  const isTeacher = Boolean(
    dbUser?.role === 'teacher' && course?.teacher_id === dbUser?.id
  )
  const materials = course?.materials || []
  const sessions = course?.sessions || []

  // Filtering materials
  const filteredMaterials = materials.filter(m => {
    const matchesSearch = searchQuery.trim() === '' ||
      m.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCat = categoryFilter === 'All' || m.category === categoryFilter
    return matchesSearch && matchesCat
  })

  const categories = ['All', 'Lecture Slides', 'Notes', 'Assignments', 'Problem Sheet', 'Other']

  return (
    <div className={`course-detail-page ${isTeacher ? 'theme-faculty' : 'theme-student'}`}>
      {/* ── TOPBAR NAVIGATION ── */}
      {loadError && <p role="alert" className="refresh-error">{loadError} <button className="btn btn-ghost btn-sm" onClick={() => loadCourseData(true)}>Retry</button></p>}
      <header className="course-topbar">
        <div className="topbar-left">
          <div className="course-brand" onClick={() => navigate('/')} title="Return to Home">
            <span className="brand-badge">/A</span>
            <span className="brand-name">AskAnon</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>

        <div className="topbar-right">
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="course-main-container fade-up">
        {/* Course Header Banner */}
        <section className="course-hero-header">
          <div className="course-header-text">
            <div className="course-code-strip">
              <span className="course-badge-code">{course?.course_code}</span>
              <span className="course-instructor-name">
                Taught by Prof. {course?.teacher?.name || 'Faculty Member'}
              </span>
            </div>
            <h1 className="course-main-title">{course?.title}</h1>
            {course?.description && (
              <p className="course-main-desc">{course.description}</p>
            )}
            <div className="course-counts-row">
              <span><Icon name="folder" /> {materials.length} Study Resources</span>
              <span><Icon name="lecture" /> {sessions.length} Lecture Archives</span>
            </div>
          </div>

          <div className="course-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isTeacher && (
              <>
                <button
                  className="btn btn-primary btn-md"
                  onClick={() => setShowUpload(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span><Icon name="folder" /></span>
                  <span>+ Upload Material</span>
                </button>

              </>
            )}
          </div>
        </section>

        {/* ── VIEW TABS ── */}
        <div className="course-tabs-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div className="course-tabs-nav" style={{ marginBottom: 0 }}>
            <button
              className={`course-tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              <Icon name="folder" /> Study Materials ({materials.length})
            </button>
            <button
              className={`course-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              <Icon name="lecture" /> Lecture Sessions ({sessions.length})
            </button>
          </div>
        </div>

        {/* ── TAB 1: STUDY MATERIALS VAULT ── */}
        {activeTab === 'materials' && (
          <div className="course-tab-pane fade-in">
            {/* Search & Category Filter Toolbar */}
            <div className="materials-toolbar-card card">
              <div className="search-box-wrap">
                <span className="search-icon"><Icon name="search" /></span>
                <input
                  type="text"
                  className="search-materials-input"
                  placeholder="Search slides, notes, handouts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: '14px' }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="category-filter-chips">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`cat-chip ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* ── COURSE VAULT AI ASSISTANT (COURSE-WIDE RAG) ── */}
            <VaultAssistant materials={materials} scope={assistantScope} onScopeChange={value => { setAssistantScope(value); setCourseAiResponse(null); setConversation([]) }} query={courseAiQuery} onQueryChange={setCourseAiQuery} response={courseAiResponse} turns={conversation} loading={courseAiLoading} onAsk={handleAskCourse} onClear={() => { setCourseAiResponse(null); setConversation([]); setCourseAiQuery('') }} />

            {/* Materials Grid */}
            {filteredMaterials.length === 0 ? (
              <div className="course-empty-state card">
                <span className="empty-state-icon"><Icon name="folder" /></span>
                <h3>{materials.length === 0 ? 'No study materials in vault yet' : 'No materials match your query'}</h3>
                <p>
                  {materials.length === 0
                    ? 'Attach lecture slides, problem sheets, or notes to this course vault so enrolled students can access them.'
                    : 'Try clearing your search query or selecting "All" categories.'}
                </p>
                {isTeacher && (
                  <button
                    className="btn btn-primary btn-md"
                    onClick={() => setShowUpload(true)}
                    style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span>+</span> Upload Material to Vault
                  </button>
                )}
                {materials.length > 0 && searchQuery && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setSearchQuery('')
                      setCategoryFilter('All')
                    }}
                    style={{ marginTop: '8px' }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="course-materials-grid">
                <ProgressiveList items={filteredMaterials} key={searchQuery + categoryFilter}>{visibleItems => <>{visibleItems.map((mat) => (
                  <div id={`material-${mat.id}`} key={mat.id} className="course-material-card card fade-up">
                    <div className="material-card-top">
                      <div className="material-card-icon">
                        {mat.file_type === 'pdf' ? <span className="pdf-label">PDF</span> : <button className="image-resource-preview" title="View image" onClick={() => setExpandedImage(mat.file_url)}><img src={mat.file_url} alt={mat.title} /></button>}
                      </div>

                      <div className="material-card-body">
                        <span className="material-category-tag">{mat.category || 'Lecture Slides'}</span>
                        <h3 className="material-title-text">{mat.title}</h3>
                        <span className="material-meta-text">
                          {formatFileSize(mat.file_size)} · Uploaded {new Date(mat.uploaded_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="material-card-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => downloadFile(mat.file_url, `${mat.title || 'Course_Material'}.${mat.file_type === 'pdf' ? 'pdf' : 'jpg'}`)}
                          title="Download material directly"
                        >
                          ↓ Download
                        </button>

                        {mat.file_type === 'pdf' && <button className="btn btn-secondary btn-sm" disabled={courseAiLoading || (!mat.indexed_at && mat.index_status !== 'ready')} title={mat.index_status === 'ready' || mat.indexed_at ? 'Ask a question using this PDF' : 'Text search must finish before this PDF can be used'} onClick={() => { setAssistantScope(String(mat.id)); setCourseAiResponse(null); setConversation([]); document.getElementById('vault-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('vault-question')?.focus({ preventScroll: true }) }}>Ask this PDF</button>}

                        {isTeacher && (
                          <button
                            className="btn btn-ghost btn-sm delete-btn"
                            onClick={() => setMaterialToDelete(mat)}
                            title="Delete resource"
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="material-index-status">
                      <span>{mat.file_type !== 'pdf' ? 'Image - view and download' : ({ ready: 'Ready for AI search', indexing: 'Preparing AI search...', pending: 'Not indexed yet', ocr: 'Reading scanned pages...', no_text: 'No readable text', failed: 'Indexing failed' }[mat.index_status] || 'Not indexed yet')}</span>
                      {mat.index_error && <p>{mat.index_error}{mat.indexed_at ? ' The previous index remains available.' : ''}</p>}
                      {isTeacher && mat.file_type === 'pdf' && !['indexing', 'ocr'].includes(mat.index_status) && (
                        <BusyButton busy={indexingId === mat.id} className="btn btn-ghost btn-sm" disabled={indexingId === mat.id} onClick={() => handleRetryIndex(mat.id)}>{indexingId === mat.id ? 'Starting...' : mat.index_status === 'ready' ? 'Reindex PDF' : 'Retry indexing'}</BusyButton>
                      )}
                    </div>

                  </div>
                ))}</>}</ProgressiveList>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: LECTURE SESSIONS ── */}
        {activeTab === 'sessions' && (
          <div className="course-tab-pane fade-in">
            {sessions.length === 0 ? (
              <div className="course-empty-state card">
                <span className="empty-state-icon"><Icon name="lecture" /></span>
                <h3>No lectures recorded yet</h3>
                <p>Sessions hosted under this course will automatically show up here with recap summaries.</p>
              </div>
            ) : (
              <div className="course-sessions-grid">
                {sessions.map((s) => (
                  <div key={s.id} className="course-session-card card fade-up">
                    <div className="session-card-top-row">
                      <span className={`badge ${s.is_active ? 'badge-crimson' : 'badge-ghost'}`}>
                        {s.is_active ? '● LIVE NOW' : '○ Completed'}
                      </span>
                      <span className="session-room-code">#{s.session_code}</span>
                    </div>

                    <h3 className="session-title">{s.title}</h3>
                    {s.subject && <p className="session-subject">{s.subject}</p>}

                    <div className="session-meta-row">
                      <span><Icon name="message" /> {s._count?.questions || 0} Questions Asked</span>
                      <span>{new Date(s.started_at).toLocaleDateString()}</span>
                    </div>

                    <div className="session-card-bottom-cta">
                      {s.is_active ? (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/session/${s.session_code}`)}
                        >
                          Join Live Room →
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/session/${s.session_code}/recap`)}
                        >
                          View Q&A Recap →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── UPLOAD MODAL FOR TEACHER ── */}
      {showUpload && (
        <div className="modal-backdrop" onClick={() => !isUploading && setShowUpload(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h2 style={{ margin: 0 }}>Upload Course Study Material</h2>
                <p className="modal-sub" style={{ margin: '4px 0 0' }}>Attach PDF slides, notes, or homework problem sheets to {course?.course_code}.</p>
              </div>
              <button disabled={isUploading}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => !isUploading && setShowUpload(false)}
                style={{ fontSize: '18px', padding: '4px 8px', lineHeight: 1 }}
                title="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>Material Title *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Lecture 12 - Virtual Memory Slides"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  className="input"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                >
                  <option value="Lecture Slides">Lecture Slides</option>
                  <option value="Notes">Notes</option>
                  <option value="Assignments">Assignments</option>
                  <option value="Problem Sheet">Problem Sheet</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>PDF or Image Document *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    const f = e.target.files[0]
                    setUploadFile(f)
                    if (f && !uploadTitle) {
                      setUploadTitle(f.name.replace(/\.[^/.]+$/, ''))
                    }
                  }}
                />
              </div>

              {uploadError && <p className="form-error-text"><Icon name="alert" /> {uploadError}</p>}

              <div className="modal-actions">
                <button disabled={isUploading} type="button" className="btn btn-ghost" onClick={() => !isUploading && setShowUpload(false)}>
                  Cancel
                </button>
                <BusyButton busy={isUploading} type="submit" className="btn btn-primary" disabled={isUploading || !uploadFile}>
                  {isUploading ? 'Uploading resource…' : 'Upload to Vault →'}
                </BusyButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Material Confirmation Modal */}
      {materialToDelete && (
        <div className="modal-backdrop" onClick={() => !pendingActions.has('delete-material') && setMaterialToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                <Icon name="alert" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Delete Study Material</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>This action cannot be undone.</p>
              </div>
            </div>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--text-primary)' }}>"{materialToDelete.title}"</strong> from this course vault?
            </p>
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button disabled={pendingActions.has('delete-material')} type="button" className="btn btn-ghost" onClick={() => !pendingActions.has('delete-material') && setMaterialToDelete(null)}>
                Cancel
              </button>
              <BusyButton busy={pendingActions.has('delete-material')}
                type="button"
                className="btn btn-danger"
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={confirmDeleteMaterial}
              >
                Delete Resource
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.type === 'error' ? "" : '✓'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
      <LightboxModal imageUrl={expandedImage} onClose={() => setExpandedImage(null)} />
    </div>
  )
}
