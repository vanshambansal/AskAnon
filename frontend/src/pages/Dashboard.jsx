import { useState, useEffect, useCallback } from 'react'
import { useUser, useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './Dashboard.css'

const API = import.meta.env.VITE_API_URL

export default function Dashboard() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()

  const [dbUser, setDbUser]     = useState(null)
  const [sessions, setSessions] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm]         = useState({ title: '', subject: '' })
  const [creating, setCreating] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [toast, setToast]       = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (user) init() }, [user])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const init = async () => {
    try {
      const token = await getToken()
      const syncRes = await axios.post(`${API}/api/users/sync`,
        { clerk_user_id: user.id, email: user.emailAddresses[0].emailAddress, name: user.fullName || user.firstName },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setDbUser(syncRes.data)
      const sessRes = await axios.get(`${API}/api/sessions/teacher/${syncRes.data.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSessions(sessRes.data)
    } catch (err) {
      console.error('Init error:', err)
    } finally {
      setLoading(false)
    }
  }

  const createSession = async () => {
    if (!form.title.trim() || creating) return
    setCreating(true)
    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/sessions`,
        { title: form.title, subject: form.subject, teacher_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setShowCreate(false)
      setForm({ title: '', subject: '' })
      navigate(`/session/${res.data.session_code}?role=teacher`)
    } catch (err) {
      console.error('Create error:', err)
      showToast('Failed to create session', 'error')
    } finally {
      setCreating(false)
    }
  }

  const deleteSession = async (s) => {
    if (s.is_active) { showToast('End the session before deleting', 'error'); return }
    if (!confirm(`Delete "${s.title}"? This cannot be undone.`)) return
    setDeleting(s.id)
    try {
      const token = await getToken()
      await axios.delete(`${API}/api/sessions/${s.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSessions(prev => prev.filter(x => x.id !== s.id))
      showToast('Session deleted')
    } catch (err) {
      console.error('Delete error:', err)
      showToast('Failed to delete', 'error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="dash-page">

      {/* TOPBAR */}
      <header className="dash-topbar">
        <div className="dash-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <span className="logo-mark">AQ</span>
            <span className="logo-text">AskAnon</span>
        </div>
        <div className="dash-topbar-right">
          <span className="dash-welcome">Hey, {user?.firstName} 👋</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="dash-main">

        {/* HERO */}
        <div className="dash-hero fade-up">
          <div className="dash-hero-text">
            <h1 className="dash-heading">
              Your classroom,<br />
              <em>amplified.</em>
            </h1>
            <p className="dash-sub">
              Create a live session and let your students ask anything — anonymously, instantly, fearlessly.
            </p>
          </div>
          <div className="dash-hero-quote">
            <span className="quote-mark">"</span>
            <p>The question you're afraid to ask is the one everyone else wants answered.</p>
          </div>
        </div>

        {/* ACTION CARDS */}
        <div className="action-cards fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="action-card action-create" onClick={() => setShowCreate(true)}>
            <div className="action-top">
              <span className="action-icon">🎓</span>
              <span className="action-arrow">→</span>
            </div>
            <h2>Create a Session</h2>
            <p>Start a live Q&A room. Share the code and watch questions roll in instantly.</p>
            <button className="btn btn-primary action-btn">Create Session →</button>
          </div>

          <div className="action-card action-join" onClick={() => navigate('/join')}>
            <div className="action-top">
              <span className="action-icon">📚</span>
              <span className="action-arrow">→</span>
            </div>
            <h2>Join a Session</h2>
            <p>Enter a 6-digit code from your teacher and ask questions without revealing your name.</p>
            <button className="btn btn-ghost action-btn">Join Session →</button>
          </div>
        </div>

        {/* PAST SESSIONS */}
        {!loading && (
          <div className="past-section fade-up" style={{ animationDelay: '0.18s' }}>
            <div className="past-header">
              <h2 className="past-heading">
                Previous Sessions
                <span className="q-count">{sessions.length}</span>
              </h2>
            </div>

            {sessions.length === 0 ? (
              <div className="past-empty">
                <span>No sessions yet — create your first one above</span>
              </div>
            ) : (
              <div className="past-grid">
                {sessions.map((s, i) => (
                  <div key={s.id} className="past-card fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                    <div className="past-card-top">
                      <span className={`badge ${s.is_active ? 'badge-green' : 'badge-teal'}`}>
                        {s.is_active ? '● Live' : '○ Ended'}
                      </span>
                      <span className="past-code">{s.session_code}</span>
                    </div>
                    <h3 className="past-title">{s.title}</h3>
                    {s.subject && <p className="past-subject">{s.subject}</p>}
                    <p className="past-date">
                      {new Date(s.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <div className="past-actions">
                      {s.is_active && (
                        <button className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/session/${s.session_code}?role=teacher`)}>
                          Reopen →
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteSession(s)}
                        disabled={deleting === s.id}
                      >
                        {deleting === s.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <span>AskAnon</span>
        <span className="footer-dot">·</span>
        <span>Ask freely, learn fearlessly</span>
        <span className="footer-dot">·</span>
        <span>Chitkara University © 2026</span>
      </footer>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="modal-overlay fade-in" onClick={() => setShowCreate(false)}>
          <div className="modal-box card fade-up" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">New Session</h2>
            <p className="modal-sub">Students will join using a unique 6-digit code</p>
            <div className="form-group">
              <label>Session Title *</label>
              <input className="input" placeholder="e.g. DSA Lecture 5 — Binary Trees"
                value={form.title} autoFocus
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && createSession()}
              />
            </div>
            <div className="form-group">
              <label>Subject <span className="label-opt">(optional)</span></label>
              <input className="input" placeholder="e.g. Data Structures"
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && createSession()}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createSession}
                disabled={creating || !form.title.trim()}>
                {creating ? 'Creating…' : 'Create & Start →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}