import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser, useAuth } from '@clerk/clerk-react'
import axios from 'axios'
import { io } from 'socket.io-client'
import { exportSessionPDF } from '../utils/exportPDF'
import './SessionRoom.css'

const API = import.meta.env.VITE_API_URL

export default function SessionRoom() {
  const { code }          = useParams()
  const [searchParams]    = useSearchParams()
  const { user }          = useUser()
  const { getToken }      = useAuth()
  const navigate          = useNavigate()
  const isTeacher         = searchParams.get('role') === 'teacher'

  const [session, setSession]             = useState(null)
  const [questions, setQuestions]         = useState([])
  const [sessionMedia, setSessionMedia]   = useState([])
  const [questionText, setQuestionText]   = useState('')
  const [dbUser, setDbUser]               = useState(null)
  const [loading, setLoading]             = useState(true)
  const [posting, setPosting]             = useState(false)
  const [error, setError]                 = useState('')
  const [cooldown, setCooldown]           = useState(0)
  const [votedIds, setVotedIds]           = useState(new Set())
  const [toast, setToast]                 = useState(null)

  // Image upload state
  const [selectedImage, setSelectedImage]   = useState(null)   // file object
  const [imagePreview, setImagePreview]     = useState(null)   // local preview URL
  const [uploadingImage, setUploadingImage] = useState(false)
  const [sharingMedia, setSharingMedia]     = useState(false)
  const [expandedImage, setExpandedImage]   = useState(null)   // lightbox

  const socketRef     = useRef(null)
  const postingRef    = useRef(false)
  const fileInputRef  = useRef(null)   // student question image
  const shareInputRef = useRef(null)   // teacher share image

  // ── INIT ────────────────────────────────────────────────
  useEffect(() => {
    if (user) init()
    return () => { socketRef.current?.disconnect() }
  }, [user, code])

  // ── COOLDOWN TIMER ──────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => c <= 1 ? 0 : c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const init = async () => {
    try {
      const token = await getToken()

      // Sync user
      const syncRes = await axios.post(`${API}/api/users/sync`,
        { clerk_user_id: user.id, email: user.emailAddresses[0].emailAddress, name: user.fullName || user.firstName },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDbUser(syncRes.data)

      // Get session
      const sessRes = await axios.get(`${API}/api/sessions/${code}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSession(sessRes.data)

      // Get questions
      const qRes = await axios.get(`${API}/api/questions/${sessRes.data.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setQuestions(qRes.data)

      // Get existing shared media
      const mediaRes = await axios.get(`${API}/api/upload/session/${sessRes.data.id}/media`)
      setSessionMedia(mediaRes.data)

      // Connect socket
      const socket = io(API, { transports: ['websocket'] })
      socketRef.current = socket
      socket.emit('join-session', code)

      socket.on('question-received', (q) => {
        setQuestions(prev => {
          if (prev.find(x => x.id === q.id)) return prev
          return sortQ([...prev, q])
        })
      })
      socket.on('question-updated', (q) => {
        setQuestions(prev => sortQ(prev.map(x => x.id === q.id ? q : x)))
      })
      socket.on('question-removed', (id) => {
        setQuestions(prev => prev.filter(x => x.id !== id))
      })
      // New: teacher shared an image
      socket.on('media-received', (media) => {
        setSessionMedia(prev => [...prev, media])
        showToast('📎 Teacher shared an image!')
      })
      // New: teacher removed a shared image
      socket.on('media-removed', (publicId) => {
        setSessionMedia(prev => prev.filter(x => x.public_id !== publicId))
      })
      socket.on('session-closed', () => {
        showToast('Teacher has ended this session')
        setTimeout(() => navigate('/dashboard'), 2000)
      })

    } catch (err) {
      console.error('Init error:', err)
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const sortQ = (qs) =>
    [...qs].sort((a, b) => b.upvotes - a.upvotes || new Date(a.created_at) - new Date(b.created_at))

  // ── STUDENT: SELECT IMAGE FOR QUESTION ─────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── STUDENT: POST QUESTION (with optional image) ────────
  const postQuestion = async () => {
    if (!questionText.trim() || postingRef.current) return
    postingRef.current = true
    setPosting(true)
    setError('')

    const text = questionText.trim()
    setQuestionText('')

    try {
      const token = await getToken()
      let image_url = null

      // Step 1 — upload image first if one is selected
      if (selectedImage) {
        setUploadingImage(true)
        const formData = new FormData()
        formData.append('image', selectedImage)
        const uploadRes = await axios.post(`${API}/api/upload/question`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        image_url = uploadRes.data.image_url
        setUploadingImage(false)
        removeSelectedImage()
      }

      // Step 2 — post the question with image_url attached
      const res = await axios.post(`${API}/api/questions`,
        { session_id: session.id, question_text: text, user_id: dbUser.id, image_url },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      // Step 3 — broadcast via socket
      socketRef.current?.emit('new-question', { sessionCode: code, question: res.data })
      showToast('Question posted!')

    } catch (err) {
      if (err.response?.status === 429) {
        const secs = parseInt(err.response.data.error.match(/\d+/)?.[0]) || 30
        setCooldown(secs)
        setError(`Please wait ${secs} seconds before posting again`)
        setQuestionText(text)
      } else {
        setError('Failed to post. Try again.')
        setQuestionText(text)
      }
      setUploadingImage(false)
    } finally {
      setPosting(false)
      postingRef.current = false
    }
  }

  // ── TEACHER: SHARE IMAGE WITH CLASS ─────────────────────
  const handleShareMedia = async (e) => {
    const file = e.target.files[0]
    if (!file || !session) return
    setSharingMedia(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await axios.post(
        `${API}/api/upload/session/${session.id}/media`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )

      // Broadcast to all students via socket
      socketRef.current?.emit('media-shared', { sessionCode: code, media: res.data })
      showToast('Image shared with everyone!')

    } catch (err) {
      console.error('Share media error:', err)
      showToast('Failed to share image', 'error')
    } finally {
      setSharingMedia(false)
      if (shareInputRef.current) shareInputRef.current.value = ''
    }
  }

  // ── TEACHER: DELETE SHARED IMAGE ────────────────────────
  const deleteMedia = async (media) => {
    try {
      const encodedId = encodeURIComponent(media.public_id)
      await axios.delete(`${API}/api/upload/media/${encodedId}`)
      socketRef.current?.emit('media-deleted', { sessionCode: code, publicId: media.public_id })
      showToast('Image removed')
    } catch (err) {
      console.error('Delete media error:', err)
      showToast('Failed to remove image', 'error')
    }
  }

  // ── UPVOTE ───────────────────────────────────────────────
  const upvote = async (q) => {
    if (votedIds.has(q.id) || isTeacher) return
    setVotedIds(prev => new Set([...prev, q.id]))
    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/questions/${q.id}/upvote`,
        { user_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('question-upvoted', { sessionCode: code, question: res.data })
    } catch {
      setVotedIds(prev => { const s = new Set(prev); s.delete(q.id); return s })
    }
  }

  // ── MARK ANSWERED ────────────────────────────────────────
  const markAnswered = async (q) => {
    try {
      const token = await getToken()
      const res = await axios.patch(`${API}/api/questions/${q.id}/answer`, {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('question-answered', { sessionCode: code, question: res.data })
      showToast('Marked as answered ✓')
    } catch (err) { console.error(err) }
  }

  // ── DELETE QUESTION ──────────────────────────────────────
  const deleteQuestion = async (q) => {
    try {
      const token = await getToken()
      await axios.delete(`${API}/api/questions/${q.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('question-deleted', { sessionCode: code, questionId: q.id })
    } catch (err) { console.error(err) }
  }

  // ── END SESSION ──────────────────────────────────────────
  const endSession = async () => {
    if (!confirm('End this session for everyone?')) return
    try {
      const token = await getToken()
      await axios.patch(`${API}/api/sessions/${session.id}/end`, {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('session-ended', code)
      exportSessionPDF(session, questions)
      navigate('/dashboard')
    } catch (err) { console.error(err) }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    showToast('Code copied!')
  }

  if (loading) return <div className="loading-screen"><span>Connecting…</span></div>

  const unanswered = questions.filter(q => !q.is_answered)
  const answered   = questions.filter(q =>  q.is_answered)

  return (
    <div className="room">

      {/* ── TOPBAR ─────────────────────────────────────── */}
      <header className="room-header">
        <div className="room-header-left">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← Back</button>
          <div className="room-title-block">
            <h1 className="room-title">{session?.title}</h1>
            {session?.subject && <span className="room-subject">{session.subject}</span>}
          </div>
        </div>

        <div className="room-header-right">
          <button className="room-code-box" onClick={copyCode} title="Click to copy">
            <span className="room-code-label">Session Code</span>
            <span className="room-code">{code}</span>
            <span className="copy-hint">click to copy</span>
          </button>
          <span className="badge badge-green">● Live</span>

          {isTeacher && (
            <div className="teacher-header-actions">
              {/* Share image button — hidden file input triggered by label */}
              <button
  className="btn btn-ghost btn-sm share-btn"
  title="Share image with entire class"
  onClick={() => shareInputRef.current?.click()}
  disabled={sharingMedia}
>
  {sharingMedia ? 'Uploading…' : '🖼 Share Image'}
</button>
<input
  ref={shareInputRef}
  type="file"
  accept="image/*,application/pdf"
  style={{ display: 'none' }}
  onClick={e => e.target.value = ''}
  onChange={handleShareMedia}
/>
              <button className="btn btn-ghost btn-sm" onClick={() => exportSessionPDF(session, questions)}>
                ↓ Export PDF
              </button>
              <button className="btn btn-danger btn-sm" onClick={endSession}>End Session</button>
            </div>
          )}
        </div>
      </header>

      <div className="room-body">

        {/* ── SHARED MEDIA STRIP (teacher images) ──────── */}
        {sessionMedia.length > 0 && (
          <div className="media-strip card fade-in">
            <div className="media-strip-header">
              <h3>📎 Shared by Teacher</h3>
              <span className="badge badge-amber">
                {sessionMedia.length} item{sessionMedia.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="media-grid">
              {sessionMedia.map((m) => (
                <div key={m.id} className="media-item">
                  <img
                    src={m.image_url}
                    alt={m.caption || 'Shared image'}
                    className="media-thumb"
                    onClick={() => setExpandedImage(m.image_url)}
                    title="Click to enlarge"
                  />
                  {m.caption && <p className="media-caption">{m.caption}</p>}
                  {isTeacher && (
                    <button
                      className="media-delete-btn"
                      onClick={() => deleteMedia(m)}
                      title="Remove this image"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ASK BOX (students only) ───────────────────── */}
        {!isTeacher && (
          <div className="ask-box card fade-up">
            <div className="ask-header">
              <div>
                <h2 className="ask-title">Ask a question</h2>
                <p className="ask-sub">100% anonymous — your name is never shown</p>
              </div>
              <span className="badge badge-teal">🎭 Anonymous</span>
            </div>

            <div className="ask-row">
              <textarea
                className="input ask-textarea"
                placeholder="What's on your mind? Press Enter to post…"
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                rows={2}
                maxLength={300}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postQuestion() }
                }}
              />
              <div className="ask-buttons">
                {/* Attach image button */}
                <label className="btn btn-ghost attach-btn" title="Attach an image to your question">
                  📎
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageSelect}
                  />
                </label>

                <button
                  className="btn btn-primary ask-btn"
                  onClick={postQuestion}
                  disabled={posting || uploadingImage || !questionText.trim() || cooldown > 0}
                >
                  {uploadingImage ? '⬆' : cooldown > 0 ? `${cooldown}s` : posting ? '…' : '↑'}
                </button>
              </div>
            </div>

            {/* Image preview — shows after student selects a file */}
            {imagePreview && (
              <div className="image-preview fade-in">
                <img src={imagePreview} alt="Preview" className="preview-thumb" />
                <div className="preview-info">
                  <span className="preview-name">{selectedImage?.name}</span>
                  <button className="btn btn-danger btn-sm" onClick={removeSelectedImage}>
                    Remove
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="ask-error fade-in">
                <span>⚠</span> {error}
              </div>
            )}
            <p className="char-count">{questionText.length}/300</p>
          </div>
        )}

        {/* ── TEACHER BAR ──────────────────────────────── */}
        {isTeacher && (
          <div className="teacher-bar fade-up">
            <span>🎓 <strong>Teacher view</strong> — ✓ to mark answered · ✕ to remove</span>
            <span className="badge badge-amber">Moderating</span>
          </div>
        )}

        {/* ── UNANSWERED QUESTIONS ─────────────────────── */}
        <div className="questions-section">
          <div className="questions-header">
            <h2>Questions <span className="q-count">{unanswered.length}</span></h2>
            <span className="sort-label">↑ sorted by votes</span>
          </div>

          {unanswered.length === 0 ? (
            <div className="empty-state fade-in">
              <span className="empty-icon">💬</span>
              <p>{isTeacher
                ? 'No questions yet — students will appear here in real-time'
                : 'No questions yet — be the first to ask!'
              }</p>
            </div>
          ) : (
            <div className="questions-list">
              {unanswered.map((q, i) => (
                <div
                  key={q.id}
                  className="question-card slide-in"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  {/* Upvote button */}
                  <button
                    className={`upvote-btn ${votedIds.has(q.id) ? 'voted' : ''}`}
                    onClick={() => upvote(q)}
                    disabled={isTeacher || votedIds.has(q.id)}
                    title={isTeacher ? 'Teachers cannot vote' : 'Upvote this question'}
                  >
                    <span className="upvote-arrow">▲</span>
                    <span className="upvote-count">{q.upvotes}</span>
                  </button>

                  {/* Question content */}
                  <div className="question-content">
                    <p className="question-text">{q.question_text}</p>

                    {/* Attached image — click to enlarge */}
                    {q.image_url && (
                      <img
                        src={q.image_url}
                        alt="Attached"
                        className="question-image"
                        onClick={() => setExpandedImage(q.image_url)}
                        title="Click to enlarge"
                      />
                    )}

                    <span className="q-time">
                      {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Teacher action buttons */}
                  {isTeacher && (
                    <div className="teacher-actions">
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => markAnswered(q)}
                        title="Mark as answered"
                      >✓</button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteQuestion(q)}
                        title="Delete question"
                      >✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ANSWERED QUESTIONS ───────────────────────── */}
        {answered.length > 0 && (
          <div className="questions-section answered-section fade-in">
            <div className="questions-header">
              <h2 className="answered-heading">
                Answered <span className="q-count">{answered.length}</span>
              </h2>
            </div>
            <div className="questions-list">
              {answered.map((q) => (
                <div key={q.id} className="question-card answered-card">
                  <div className="answered-tick">✓</div>
                  <div className="question-content">
                    <p className="question-text">{q.question_text}</p>
                    {q.image_url && (
                      <img
                        src={q.image_url}
                        alt="Attached"
                        className="question-image"
                        onClick={() => setExpandedImage(q.image_url)}
                      />
                    )}
                    <div className="question-meta-row">
                      <span className="q-time">
                        {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="badge badge-green">Answered</span>
                    </div>
                  </div>
                  {isTeacher && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteQuestion(q)}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>



      {/* ── FOOTER ───────────────────────────────────── */}
      <footer className="room-footer">
        <span>AskAnon · Ask freely, learn fearlessly</span>
        <span>Session: <strong>{code}</strong></span>
      </footer>

      {/* ── IMAGE LIGHTBOX ────────────────────────────── */}
      {expandedImage && (
        <div className="lightbox fade-in" onClick={() => setExpandedImage(null)}>
          <button className="lightbox-close" onClick={() => setExpandedImage(null)}>✕</button>
          <img src={expandedImage} alt="Full size" className="lightbox-img" />
          <p className="lightbox-hint">Click anywhere to close</p>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ───────────────────────── */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  )
}