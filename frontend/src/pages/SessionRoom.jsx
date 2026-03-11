import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser, useAuth } from '@clerk/clerk-react'
import axios from 'axios'
import { io } from 'socket.io-client'
import './SessionRoom.css'
import { exportSessionPDF } from '../utils/exportPDF'

const API = import.meta.env.VITE_API_URL

export default function SessionRoom() {
  const { code }          = useParams()
  const [searchParams]    = useSearchParams()
  const { user }          = useUser()
  const { getToken }      = useAuth()
  const navigate          = useNavigate()
  const isTeacher         = searchParams.get('role') === 'teacher'

  const [session, setSession]       = useState(null)
  const [questions, setQuestions]   = useState([])
  const [questionText, setQuestionText] = useState('')
  const [dbUser, setDbUser]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [posting, setPosting]       = useState(false)
  const [error, setError]           = useState('')
  const [cooldown, setCooldown]     = useState(0)
  const [votedIds, setVotedIds]     = useState(new Set())
  const [toast, setToast]           = useState(null)
  const socketRef   = useRef(null)
  const postingRef  = useRef(false)   // prevents double post

  useEffect(() => {
    if (user) init()
    return () => { socketRef.current?.disconnect() }
  }, [user, code])

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

      // Load session
      const sessRes = await axios.get(`${API}/api/sessions/${code}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSession(sessRes.data)

      // Load questions
      const qRes = await axios.get(`${API}/api/questions/${sessRes.data.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setQuestions(qRes.data)

      // Socket — connect once
      const socket = io(API, { transports: ['websocket'] })
      socketRef.current = socket
      socket.emit('join-session', code)

      socket.on('question-received', (q) => {
        setQuestions(prev => {
          // prevent duplicate if this client already added it optimistically
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

  const postQuestion = async () => {
    if (!questionText.trim() || postingRef.current) return
    postingRef.current = true
    setPosting(true)
    setError('')

    const text = questionText.trim()
    setQuestionText('') // clear immediately so user can type next question

    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/questions`,
        { session_id: session.id, question_text: text, user_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      // Only emit socket — don't add to local state, socket will handle it
      socketRef.current?.emit('new-question', { sessionCode: code, question: res.data })
      showToast('Question posted!')
    } catch (err) {
      if (err.response?.status === 429) {
        const secs = parseInt(err.response.data.error.match(/\d+/)?.[0]) || 30
        setCooldown(secs)
        setError(`Please wait ${secs} seconds before posting again`)
        setQuestionText(text) // restore text so they don't lose it
      } else {
        setError('Failed to post. Try again.')
        setQuestionText(text)
      }
    } finally {
      setPosting(false)
      postingRef.current = false
    }
  }

  const upvote = async (q) => {
    if (votedIds.has(q.id) || isTeacher) return
    setVotedIds(prev => new Set([...prev, q.id])) // optimistic
    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/questions/${q.id}/upvote`,
        { user_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('question-upvoted', { sessionCode: code, question: res.data })
    } catch (err) {
      setVotedIds(prev => { const s = new Set(prev); s.delete(q.id); return s }) // rollback
    }
  }

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

  const deleteQuestion = async (q) => {
    try {
      const token = await getToken()
      await axios.delete(`${API}/api/questions/${q.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      socketRef.current?.emit('question-deleted', { sessionCode: code, questionId: q.id })
    } catch (err) { console.error(err) }
  }

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
    showToast('Code copied to clipboard!')
  }

  if (loading) return <div className="loading-screen"><span>Connecting…</span></div>

  const unanswered = questions.filter(q => !q.is_answered)
  const answered   = questions.filter(q => q.is_answered)

  return (
    <div className="room">

      {/* TOPBAR */}
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
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => exportSessionPDF(session, questions)}
              >
                ↓ Export PDF
              </button>
              <button className="btn btn-danger btn-sm" onClick={endSession}>
                End Session
              </button>
            </>
          )}
        </div>
      </header>

      <div className="room-body">

        {/* ASK BOX — students only */}
        {!isTeacher && (
          <div className="ask-box card fade-up">
            <div className="ask-header">
              <div>
                <h2 className="ask-title">Ask a question</h2>
                <p className="ask-sub">100% anonymous — your name is never shown to anyone</p>
              </div>
              <span className="badge badge-teal">🎭 Anonymous</span>
            </div>
            <div className="ask-row">
              <textarea
                className="input ask-textarea"
                placeholder="What's on your mind? Press Enter to post…"
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                rows={2} maxLength={300}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postQuestion() }
                }}
              />
              <button className="btn btn-primary ask-btn" onClick={postQuestion}
                disabled={posting || !questionText.trim() || cooldown > 0}>
                {cooldown > 0 ? `${cooldown}s` : posting ? '…' : '↑'}
              </button>
            </div>
            {error && <div className="ask-error fade-in"><span>⚠</span> {error}</div>}
            <p className="char-count">{questionText.length}/300</p>
          </div>
        )}

        {/* TEACHER INFO BAR */}
        {isTeacher && (
          <div className="teacher-bar fade-up">
            <span>🎓 <strong>Teacher view</strong> — click ✓ to mark answered, ✕ to remove</span>
            <span className="badge badge-amber">Moderating</span>
          </div>
        )}

        {/* UNANSWERED QUESTIONS */}
        <div className="questions-section">
          <div className="questions-header">
            <h2>Questions <span className="q-count">{unanswered.length}</span></h2>
            <span className="sort-label">↑ sorted by votes</span>
          </div>

          {unanswered.length === 0 ? (
            <div className="empty-state fade-in">
              <span className="empty-icon">💬</span>
              <p>{isTeacher ? 'No questions yet — students will appear here' : 'No questions yet — be the first!'}</p>
            </div>
          ) : (
            <div className="questions-list">
              {unanswered.map((q, i) => (
                <div key={q.id} className="question-card slide-in" style={{ animationDelay: `${i * 0.03}s` }}>
                  <button
                    className={`upvote-btn ${votedIds.has(q.id) ? 'voted' : ''}`}
                    onClick={() => upvote(q)}
                    disabled={isTeacher || votedIds.has(q.id)}
                    title={isTeacher ? '' : votedIds.has(q.id) ? 'Already voted' : 'Upvote'}
                  >
                    <span className="upvote-arrow">▲</span>
                    <span className="upvote-count">{q.upvotes}</span>
                  </button>

                  <div className="question-content">
                    <p className="question-text">{q.question_text}</p>
                    <span className="q-time">
                      {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {isTeacher && (
                    <div className="teacher-actions">
                      <button className="btn btn-success btn-sm" onClick={() => markAnswered(q)} title="Mark as answered">✓</button>
                      <button className="btn btn-danger btn-sm"  onClick={() => deleteQuestion(q)} title="Delete question">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ANSWERED QUESTIONS */}
        {answered.length > 0 && (
          <div className="questions-section answered-section fade-in">
            <div className="questions-header">
              <h2 className="answered-heading">Answered <span className="q-count">{answered.length}</span></h2>
            </div>
            <div className="questions-list">
              {answered.map((q) => (
                <div key={q.id} className="question-card answered-card">
                  <div className="answered-tick">✓</div>
                  <div className="question-content">
                    <p className="question-text">{q.question_text}</p>
                    <div className="question-meta-row">
                      <span className="q-time">
                        {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="badge badge-green">Answered</span>
                    </div>
                  </div>
                  {isTeacher && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q)} title="Delete">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="room-footer">
        <span>AskAnon · Ask freely, learn fearlessly</span>
        <span>Session: <strong>{code}</strong></span>
      </footer>

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}