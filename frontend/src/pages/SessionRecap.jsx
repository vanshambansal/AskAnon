import usePendingActions from '../hooks/usePendingActions'
import { BusyButton, PageSkeleton } from '../components/common/AsyncFeedback'
import Icon from '../components/common/Icon'
import useWorkspaceUpdates from '../hooks/useWorkspaceUpdates'
import { useState, useEffect, useEffectEvent, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, UserButton } from '@clerk/clerk-react'
import axios from 'axios'
import { exportSessionPDF } from '../utils/lazyExportPDF'
import { downloadFile } from '../utils/downloadHelper'
import LightboxModal from '../components/session/LightboxModal'
import './SessionRecap.css'

const API = import.meta.env.VITE_API_URL
let nextRequestId = 0

export default function SessionRecap() {
  const { code } = useParams()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { pending: pendingActions, run: runAction } = usePendingActions()

  const loadRequest = useRef(0)
  const [session, setSession] = useState(null)
  const [questions, setQuestions] = useState([])
  const [media, setMedia] = useState([])
  const [materials, setMaterials] = useState([])
  const [polls, setPolls] = useState([])
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'questions' | 'polls' | 'materials'
  const [loading, setLoading] = useState(true)
  const [expandedImage, setExpandedImage] = useState(null)

  // AI Lecture Insights State
  const [aiInsights, setAiInsights] = useState(null)
  const [insightsError, setInsightsError] = useState('')
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [refreshingInsights, setRefreshingInsights] = useState(false)
  const [error, setError] = useState('')
  const [dbUser, setDbUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('db_user'))
    } catch {
      return null
    }
  })

  const initialize = useEffectEvent(() => loadRecap())
  useEffect(() => {
    initialize()
    return () => { loadRequest.current = ++nextRequestId }
  }, [code])

  useWorkspaceUpdates({
    onChange: event => { if (session && (event.sessionId === session.id || event.courseId === session.course_id || event.reason)) loadRecap(true) },
    onSessionDeleted: ids => { if (session && ids.includes(session.id)) { loadRequest.current = ++nextRequestId; setSession(null); setError('This lecture was deleted by its instructor.'); setLoading(false) } }
  })

  const parseInsights = (val) => {
    if (!val) return null
    if (typeof val === 'string') {
      try {
        return JSON.parse(val)
      } catch {
        return null
      }
    }
    return val
  }

  const loadRecap = async (quiet = false) => {
    const request = ++nextRequestId
    loadRequest.current = request
    if (quiet !== true) setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}

      // Get session details
      const sessRes = await axios.get(`${API}/api/sessions/${code}/recap-bundle`, { headers })
      if (request !== loadRequest.current) return
      const sessionData = sessRes.data.session

      if (!sessionData) {
        setError('Session not found.')
        return
      }

      // If session is still live, send user directly to live room
      if (sessionData.is_active) {
        navigate(`/session/${code}`)
        return
      }

      setSession(sessionData)

      // Fetch dbUser if available
      let cachedDbUser = null
      try {
        cachedDbUser = JSON.parse(sessionStorage.getItem('db_user'))
      } catch { /* Profile sync below restores an empty or invalid cache. */ }
      if (!cachedDbUser) {
        cachedDbUser = (await axios.post(`${API}/api/users/sync`, {}, { headers })).data
        sessionStorage.setItem('db_user', JSON.stringify(cachedDbUser))
      }
      setDbUser(cachedDbUser)

      if (request !== loadRequest.current) return
      const bundle = sessRes.data
      setQuestions((bundle.questions || []).filter(q => !['FLAGGED', 'DISMISSED'].includes(q.status)))
      setMedia(bundle.media || [])
      setMaterials(bundle.materials || [])
      setPolls(bundle.polls || [])
      setBookmarkedIds(new Set(bundle.bookmarkedIds || []))

      // If already stored on session, use it; otherwise fetch from endpoint
      const storedInsights = parseInsights(sessionData.ai_summary)
      setInsightsError('')
      if (storedInsights?.version === 2) {
        setLoadingInsights(false)
        setAiInsights(storedInsights)
      } else {
        setAiInsights(null)
        setLoadingInsights(true)
        axios.get(`${API}/api/sessions/${sessionData.id}/ai-insights`, { headers })
          .then(res => { if (request === loadRequest.current) setAiInsights(parseInsights(res.data)) })
          .catch(err => { if (request === loadRequest.current) setInsightsError(err.response?.data?.error || 'Could not generate the recap. Please retry.') })
          .finally(() => { if (request === loadRequest.current) setLoadingInsights(false) })
      }
    } catch (err) {
      if (request !== loadRequest.current) return
      console.error('Load recap error:', err)
      setError('Unable to load lecture recap details.')
    } finally {
      if (request === loadRequest.current) setLoading(false)
    }
  }

  const handleRefreshInsights = async () => {
    if (!session || refreshingInsights) return
    setRefreshingInsights(true)
    setInsightsError('')
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = session.teacher_id === dbUser?.id
        ? await axios.post(`${API}/api/sessions/${session.id}/ai-insights/refresh`, {}, { headers })
        : await axios.get(`${API}/api/sessions/${session.id}/ai-insights`, { headers })
      setAiInsights(parseInsights(res.data))
    } catch (err) {
      setInsightsError(err.response?.data?.error || 'Could not refresh the recap. The last valid analysis is still available.')
    } finally {
      setRefreshingInsights(false)
    }
  }

  const handleToggleBookmark = async (questionId) => {
    return runAction(`bookmark:${questionId}`, async () => {
    let cachedDbUser = null
    try {
      cachedDbUser = JSON.parse(sessionStorage.getItem('db_user'))
    } catch { /* No cached value is available; use the normal loading path. */ }

    if (!cachedDbUser?.id) return
    const isCurrently = bookmarkedIds.has(questionId)

    setBookmarkedIds((prev) => {
      const next = new Set(prev)
      if (isCurrently) next.delete(questionId)
      else next.add(questionId)
      return next
    })

    try {
      const token = await getToken()
      await axios.post(
        `${API}/api/bookmarks/${questionId}/toggle`,
        { user_id: cachedDbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (err) {
      console.error('Recap toggle bookmark error:', err)
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (isCurrently) next.add(questionId)
        else next.delete(questionId)
        return next
      })
    }
    })
  }

  const formatFileSize = (bytes) => {

    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) return <PageSkeleton label="Opening lecture recap..." />

  if (error && !session) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '16px' }}>
        <span style={{ fontSize: '16px', color: 'var(--brand-crimson)', fontWeight: 600 }}><Icon name="alert" /> {error}</span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary btn-sm" onClick={loadRecap}>
            <Icon name="refresh" /> Retry
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const studentQuestions = questions.filter(q => !q.content_type || q.content_type === 'QUESTION')
  const answered = studentQuestions.filter((q) => q.is_answered || q.status === 'ANSWERED')
  const unanswered = studentQuestions.filter((q) => !q.is_answered && q.status !== 'ANSWERED')
  const totalQuestions = studentQuestions.length
  const answerRate = totalQuestions === 0 ? 0 : Math.round((answered.length / totalQuestions) * 100)
  const topQuestion = [...studentQuestions].sort((a, b) => b.upvotes - a.upvotes)[0]

  const isTeacher = Boolean(session && dbUser && session.teacher_id === dbUser.id)

  const formatLectureTime = (started, ended) => {
    if (!started) return ''
    const startStr = new Date(started).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const endStr = ended ? new Date(ended).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Concluded'
    const dateStr = new Date(started).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${dateStr} · ${startStr} — ${endStr}`
  }

  return (
    <div className="recap-editorial-page">
      {/* ── TOPBAR NAVIGATION ── */}
      <header className="recap-topbar">
        <div className="recap-topbar-left">
          <div className="recap-brand" onClick={() => navigate('/')} title="Return to Home">
            <span className="brand-badge">/A</span>
            <span className="brand-name">AskAnon</span>
          </div>
          <button className="btn btn-ghost btn-sm back-dash-btn" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>

        <div className="recap-topbar-right">
          <button
            className="btn btn-primary btn-sm recap-export-btn"
            onClick={() => exportSessionPDF(session, questions, aiInsights, { polls, materials, media, isTeacher })}
            title="Download full lecture Q&A and AI brief as PDF"
          >
            Download PDF ↓
          </button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* ── MAIN EDITORIAL CONTAINER ── */}
      <main className="recap-main-content fade-up">
        {/* Lecture Header Banner */}
        <section className="recap-hero-banner">
          <div className="recap-title-group">
            <div className="recap-heading-row">
              <h1 className="recap-main-title">
                {session?.course?.course_code ? `${session.course.course_code}: ` : ''}
                {session?.title || 'Lecture Recap'}
              </h1>
              <span className="recap-status-badge">COMPLETED</span>
            </div>
            <p className="recap-time-range">
              {formatLectureTime(session?.started_at, session?.ended_at)}
              {session?.subject && ` · ${session.subject}`}
            </p>
          </div>

          <div className="recap-room-code-tag">
            <span className="tag-label">ROOM CODE</span>
            <span className="tag-code">#{session?.session_code}</span>
          </div>
        </section>

        {/* ── VIEW TABS ── */}
        <div className="recap-tabs-row">
          <button
            className={`recap-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`recap-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
            onClick={() => setActiveTab('questions')}
          >
            Discussion ({questions.length})
          </button>
          <button
            className={`recap-tab-btn ${activeTab === 'polls' ? 'active' : ''}`}
            onClick={() => setActiveTab('polls')}
          >
            Interactive Polls ({polls.length})
          </button>
          <button
            className={`recap-tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
            onClick={() => setActiveTab('materials')}
          >
            Materials & Slides ({materials.length})
          </button>
        </div>

        {/* ── 4-STAT SUMMARY METRICS GRID ── */}
        <section className="recap-metrics-grid">
          <div className="metric-stat-card card">
            <span className="metric-stat-num">{totalQuestions}</span>
            <span className="metric-stat-label">Doubts Asked</span>
          </div>

          <div className="metric-stat-card card">
            <span className="metric-stat-num status-green">{answered.length}</span>
            <span className="metric-stat-label">Answered</span>
          </div>

          <div className="metric-stat-card card">
            <span className="metric-stat-num status-amber">{unanswered.length}</span>
            <span className="metric-stat-label">Unanswered</span>
          </div>

          <div className="metric-stat-card card">
            <span className="metric-stat-num">{answerRate}%</span>
            <span className="metric-stat-label">Answer Rate</span>
          </div>
        </section>

        {/* ── TAB 1: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="recap-tab-content fade-in">
            {/* ── AI ACADEMIC INTELLIGENCE SYNTHESIS CARD ── */}
            <section className="recap-ai-card card fade-up">
              <div className="ai-card-header">
                <div className="ai-header-left">
                  <span className="ai-pill-tag">LECTURE ANALYSIS</span>
                  <h2 className="ai-card-title">
                    {isTeacher ? 'Faculty Lecture Synthesis' : 'Lecture Synthesis & Exam Revision'}
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {(isTeacher || !aiInsights) && (
                    <BusyButton busy={refreshingInsights}
                      type="button"
                      className="btn btn-ghost btn-sm ai-refresh-btn"
                      onClick={handleRefreshInsights}
                      disabled={refreshingInsights}
                      title="Re-run AI analysis over latest questions"
                    >
                      {refreshingInsights ? 'Generating...' : aiInsights ? 'Refresh analysis' : 'Retry analysis'}
                    </BusyButton>
                  )}
                </div>
              </div>

              {insightsError && <p role="alert" className="recap-ai-notice">{insightsError}</p>}
              {loadingInsights ? (
                <div className="ai-loading-skeleton">
                  <span className="ai-skeleton-pulse">Preparing an analysis of recorded classroom discussion...</span>
                </div>
              ) : !aiInsights || aiInsights.status === 'empty' ? (
                <p className="recap-ai-notice">{aiInsights?.student_misconceptions || 'AI analysis is unavailable. Questions, answers and lecture resources remain available below.'}</p>
              ) : (
                <div className="ai-card-body">
                  {/* 1. Core Conceptual Pillars (Shared) */}
                  <div className="ai-section-group">
                    <span className="ai-group-label">CORE CONCEPTS</span>
                    <div className="ai-concepts-list">
                      {(Array.isArray(aiInsights?.core_concepts) ? aiInsights.core_concepts : [session?.title || 'Key Topics']).map((concept, idx) => (
                        <span key={idx} className="ai-concept-chip">
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 2. Questions and learning gaps (Shared) */}
                  <div className="ai-misconception-callout">
                    <div className="misconception-header">
                      <span className="misconception-icon"><Icon name="message" /></span>
                      <span className="misconception-title">Questions and learning gaps</span>
                    </div>
                    <p className="misconception-text">
                      {aiInsights?.student_misconceptions || 'Student questions explored foundational concepts and edge-case mechanics.'}
                    </p>
                  </div>

                  {/* 3. Role-Tailored Perspective Box */}
                  {isTeacher ? (
                    <div className="ai-role-box teacher-box">
                      <div className="role-box-header">
                        <span className="role-box-badge">INSTRUCTOR FOLLOW-UP</span>
                        <span className="role-box-title">Recommended 5-Minute Follow-up for Next Class:</span>
                      </div>
                      <p className="role-box-text">
                        {aiInsights?.action_for_next_lecture || 'Open the next session with a brief review of today’s most upvoted doubts.'}
                      </p>
                    </div>
                  ) : (
                    <div className="ai-role-box student-box">
                      <div className="role-box-header">
                        <span className="role-box-badge">REVISION GUIDANCE</span>
                        <span className="role-box-title">Key Takeaway for Exam Revision:</span>
                      </div>
                      <p className="role-box-text">
                        {aiInsights?.exam_revision_note || 'Ensure you review the definitions, code samples, and problem sets from today’s lecture.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Key Highlights Row */}
            <div className="recap-highlights-row">
              <div className="highlight-card card">
                <span className="highlight-tag">TOP UPVOTED QUESTION</span>
                {topQuestion ? (
                  <div className="top-question-body">
                    <p className="top-q-text">"{topQuestion.question_text}"</p>
                    <span className="badge badge-crimson">▲ {topQuestion.upvotes} student upvotes</span>
                  </div>
                ) : (
                  <p className="highlight-empty">No questions recorded in this lecture.</p>
                )}
              </div>

              <div className="highlight-card card">
                <span className="highlight-tag">MOST ACTIVE TOPIC</span>
                <p className="topic-name">{session?.subject || session?.title || 'General Curriculum'}</p>
                <span className="highlight-sub">
                  {materials.length} attached study resources available
                </span>
              </div>
            </div>

            {/* Attached Study Materials Preview */}
            <div className="recap-section-box">
              <div className="section-box-header">
                <h2 className="section-box-title">Lecture Study Materials</h2>
                <button className="see-all-link" onClick={() => setActiveTab('materials')}>
                  View all ({materials.length}) →
                </button>
              </div>

              {materials.length === 0 ? (
                <div className="recap-empty-box">
                  <div>
                    <p>No lecture-specific materials were attached to this session.</p>
                    {session.course_id && <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/courses/${session.course_id}`)}>Browse course vault</button>}
                  </div>
                </div>
              ) : (
                <div className="recap-materials-grid">
                  {materials.slice(0, 3).map((mat) => (
                    <div key={mat.id} className="recap-material-card">
                      <div className={`recap-pdf-icon ${mat.file_type !== 'pdf' ? 'recap-image-icon' : ''}`}>{mat.file_type === 'pdf' ? 'PDF' : <Icon name="image" />}</div>
                      <div className="recap-mat-info">
                        <h4 className="recap-mat-title">{mat.title}</h4>
                        <span className="recap-mat-sub">
                          {mat.category || 'Slides'} · {formatFileSize(mat.file_size)}
                        </span>
                      </div>
                      <a
                        href={mat.file_url}
                        onClick={e => { e.preventDefault(); downloadFile(mat.file_url, `${mat.title}.${mat.file_type === 'pdf' ? 'pdf' : 'jpg'}`) }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                        download
                      >
                        ↓
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shared Whiteboard Media */}
            {media.length > 0 && (
              <div className="recap-section-box">
                <h2 className="section-box-title">Whiteboard Photos & Diagrams Shared</h2>
                <div className="recap-media-gallery">
                  {media.map((m) => (
                    <div
                      key={m.id}
                      className="recap-media-card"
                      onClick={() => setExpandedImage(m.image_url)}
                      title="Click to expand"
                    >
                      <img src={m.image_url} alt={m.caption || 'Lecture diagram'} className="recap-media-thumb" />
                      {m.caption && <p className="recap-media-caption">{m.caption}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: ALL QUESTIONS ── */}
        {activeTab === 'questions' && (
          <div className="recap-tab-content fade-in">
            <div className="recap-questions-stream">
              {questions.length === 0 ? (
                <div className="recap-empty-box">
                  <p>No questions were submitted during this session.</p>
                </div>
              ) : (
                questions.map((q) => {
                  const isAns = q.is_answered || q.status === 'ANSWERED'
                  const isBookmarked = bookmarkedIds.has(q.id)
                  return (
                    <div key={q.id} className={`recap-question-item card ${isAns ? 'answered' : ''}`}>
                      <div className="recap-q-vote-col">
                        <span className="recap-q-vote-badge">▲ {q.upvotes}</span>
                      </div>
                      <div className="recap-q-body-col" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <p className="recap-q-text" style={{ flex: 1, margin: 0 }}>{q.question_text}</p>
                          <button
                            type="button"
                            disabled={pendingActions.has(`bookmark:${q.id}`)}
                            aria-busy={pendingActions.has(`bookmark:${q.id}`)}
                            className={`recap-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                            onClick={() => handleToggleBookmark(q.id)}
                            title={isBookmarked ? 'Remove bookmark' : 'Bookmark doubt to your notebook'}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '1.25rem',
                              lineHeight: 1,
                              padding: '2px 6px',
                              color: isBookmarked ? '#F59E0B' : 'var(--text-muted)'
                            }}
                          >
                            {isBookmarked ? '★' : '☆'}
                          </button>
                        </div>

                        {/* Code Snippet if any */}
                        {q.code_snippet && (
                          <div style={{ marginTop: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 14px' }}>
                            <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--brand-crimson)', fontWeight: 700 }}>
                              {(q.code_language || 'CODE').toUpperCase()}
                            </span>
                            <pre style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                              <code>{q.code_snippet}</code>
                            </pre>
                          </div>
                        )}

                        {q.image_url && (
                          <img
                            src={q.image_url}
                            alt="Question Diagram"
                            className="recap-q-inline-thumb"
                            onClick={() => setExpandedImage(q.image_url)}
                          />
                        )}

                        {/* Official Professor's Answer */}
                        {q.answer_text && (
                          <div className="recap-answer-box fade-in" style={{
                            marginTop: '12px',
                            padding: '12px 16px',
                            background: 'rgba(34, 197, 94, 0.08)',
                            borderLeft: '3px solid #22C55E',
                            borderRadius: '0 6px 6px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              <Icon name="user" /> Professor's Answer
                            </span>
                            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                              {q.answer_text}
                            </p>
                          </div>
                        )}

                        <div className="recap-q-meta-line" style={{ marginTop: '10px' }}>
                          <span>
                            {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {q.content_type && q.content_type !== 'QUESTION' && <span className="badge badge-ghost">Instructor broadcast</span>}
                          {q.category && <span className="badge badge-ghost">{q.category}</span>}
                          {isAns ? (
                            <span className="badge badge-green">✓ Answered</span>
                          ) : (
                            <span className="badge badge-amber">○ Unresolved</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: LIVE POLLS & QUIZZES ── */}
        {activeTab === 'polls' && (
          <div className="recap-tab-content fade-in">
            {polls.length === 0 ? (
              <div className="recap-empty-box">
                <p>No live interactive polls or concept checks were conducted in this lecture.</p>
              </div>
            ) : (
              <div className="recap-polls-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {polls.map((poll, idx) => {
                  const totalVotes = (poll.options || []).reduce((acc, opt) => acc + (opt.votes || 0), 0)
                  return (
                    <div key={poll.id} className="recap-poll-card card" style={{ padding: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span className="badge badge-ghost" style={{ fontWeight: 600 }}>Poll #{idx + 1}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <Icon name="chart" /> {totalVotes} total response{totalVotes === 1 ? '' : 's'}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: '18px', fontWeight: 600 }}>{poll.question}</h3>
                      <div className="recap-poll-options" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(poll.options || []).map((opt) => {
                          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0
                          return (
                            <div key={opt.id || opt.index} style={{
                              position: 'relative',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '8px',
                              padding: '12px 18px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: `${pct}%`,
                                background: 'rgba(200, 30, 61, 0.16)',
                                transition: 'width 0.4s ease'
                              }} />
                              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{opt.text}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                  {opt.votes} ({pct}%)
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}


        {/* ── TAB 3: MATERIALS ── */}
        {activeTab === 'materials' && (
          <div className="recap-tab-content fade-in">
            {materials.length === 0 ? (
              <div className="recap-empty-box">
                <p>No lecture slides, notes, or handouts are attached to this recap.</p>
              </div>
            ) : (
              <div className="recap-materials-full-list">
                {materials.map((mat) => (
                  <div key={mat.id} className="recap-material-card card">
                    <div className={`recap-pdf-icon ${mat.file_type !== 'pdf' ? 'recap-image-icon' : ''}`}>{mat.file_type === 'pdf' ? 'PDF' : <Icon name="image" />}</div>
                    <div className="recap-mat-info">
                      <h4 className="recap-mat-title">{mat.title}</h4>
                      <span className="recap-mat-sub">
                        {mat.category || 'Lecture Slides'} · {formatFileSize(mat.file_size)}
                      </span>
                    </div>
                    <a
                      href={mat.file_url}
                        onClick={e => { e.preventDefault(); downloadFile(mat.file_url, `${mat.title}.${mat.file_type === 'pdf' ? 'pdf' : 'jpg'}`) }}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                      download
                    >
                      Download Material ↓
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox for full image preview */}
      <LightboxModal imageUrl={expandedImage} onClose={() => setExpandedImage(null)} />
    </div>
  )
}
