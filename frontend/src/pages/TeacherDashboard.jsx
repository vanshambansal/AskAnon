import { useState, useEffect } from 'react'
import { useUser, UserButton , useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './TeacherDashboard.css'

const API = import.meta.env.VITE_API_URL

export default function TeacherDashboard() {
  const { user } = useUser()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '' })
  const [showForm, setShowForm] = useState(false)
  const [role, setRole] = useState(null)
  const { getToken } = useAuth()


  // On mount — sync user to our DB and load their sessions
  useEffect(() => {
    if (user) syncUser()
  }, [user])

const syncUser = async () => {
  try {
    const token = await getToken()
    // Just fetch current user — role already set during RoleSelect
    const res = await axios.get(`${API}/api/users/me`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    setDbUser(res.data)
    setRole(res.data.role)
    loadSessions(token, res.data.id)
  } catch (err) {
    console.error('Sync error:', err)
  }
}

  const loadSessions = async (token, teacherId) => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/sessions/teacher/${teacherId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSessions(res.data)
    } catch (err) {
      console.error('Load sessions error:', err)
    } finally {
      setLoading(false)
    }
  }

  const createSession = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/sessions`,
        { title: form.title, subject: form.subject },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSessions(prev => [res.data, ...prev])
      setForm({ title: '', subject: '' })
      setShowForm(false)
      // Go directly to the session room
      navigate(`/session/${res.data.session_code}`)
    } catch (err) {
      console.error('Create session error:', err)
    } finally {
      setCreating(false)
    }
  }

  const openSession = (code) => navigate(`/session/${code}`)

  return (
    <div className="dashboard">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-mark">AQ</span>
          <span className="logo-text">AskAnon</span>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item active">
            <span>⬡</span> Sessions
          </button>
          <button className="nav-item" onClick={() => navigate('/join')}>
            <span>↗</span> Join Session
          </button>
        </nav>

        <div className="sidebar-user">
          <UserButton afterSignOutUrl="/" />
          <div className="user-info">
            <span className="user-name">{user?.firstName}</span>
            <span className="user-role badge badge-amber">Teacher</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="dash-main">

        {/* Header */}
        <div className="dash-header fade-up">
          <div>
            <h1 className="dash-title">Your Sessions</h1>
            <p className="dash-sub">Create and manage your live Q&A sessions</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + New Session
          </button>
        </div>

        {/* Create form modal */}
        {showForm && (
          <div className="modal-overlay fade-in" onClick={() => setShowForm(false)}>
            <div className="modal card fade-up" onClick={e => e.stopPropagation()}>
              <h2 className="modal-title">New Session</h2>
              <p className="modal-sub">Students will join using the generated code</p>

              <div className="form-group">
                <label>Session Title *</label>
                <input className="input" placeholder="e.g. DSA Lecture 5 — Trees"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Subject</label>
                <input className="input" placeholder="e.g. Data Structures"
                  value={form.subject}
                  onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                />
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createSession} disabled={creating || !form.title.trim()}>
                  {creating ? 'Creating…' : 'Create & Start →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sessions grid */}
        {loading ? (
          <div className="empty-state">
            <span className="empty-icon">⟳</span>
            <p>Loading sessions…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="empty-state fade-up">
            <span className="empty-icon">⬡</span>
            <h3>No sessions yet</h3>
            <p>Create your first session and share the code with your students</p>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              Create your first session
            </button>
          </div>
        ) : (
          <div className="sessions-grid">
            {sessions.map((s, i) => (
              <div key={s.id} className="session-card fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="session-card-top">
                  <span className={`badge ${s.is_active ? 'badge-green' : 'badge-teal'}`}>
                    {s.is_active ? '● Live' : '○ Ended'}
                  </span>
                  <span className="session-code">{s.session_code}</span>
                </div>
                <h3 className="session-title">{s.title}</h3>
                {s.subject && <p className="session-subject">{s.subject}</p>}
                <div className="session-meta">
                  <span>{new Date(s.started_at).toLocaleDateString()}</span>
                </div>
                {s.is_active && (
                  <button className="btn btn-primary btn-sm session-btn" onClick={() => openSession(s.session_code)}>
                    Open Room →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}