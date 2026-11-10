import Icon from '../components/common/Icon'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserButton, useAuth } from '@clerk/clerk-react'
import axios from 'axios'
import './JoinSession.css'

const API = import.meta.env.VITE_API_URL

export default function JoinSession() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  const handleJoin = async (e) => {
    e?.preventDefault()
    const clean = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      setError('Please enter a valid session code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res = await axios.get(`${API}/api/sessions/${clean}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.data.is_active) {
        navigate(`/session/${clean}/recap`)
      } else {
        navigate(`/session/${clean}`)
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Session room not found. Please verify the code.')
      } else {
        setError('Something went wrong. Please check your network.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="join-editorial-page">
      {/* Navigation */}
      <nav className="join-nav">
        <div className="join-nav-left" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="brand-badge">/A</span>
          <span className="brand-name">AskAnon</span>
        </div>
        <div className="join-nav-right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      {/* Main Join Container */}
      <main className="join-main-center">
        <div className="join-card-container fade-up">
          <div className="join-card-badge">ENTER CLASSROOM</div>
          <h1 className="join-title">Join a Live Session</h1>
          <p className="join-subtitle">
            Enter the 6-character room code shared by your professor to ask questions anonymously.
          </p>

          <form onSubmit={handleJoin} className="join-form-wrapper">
            <div className="join-input-box-editorial">
              <span className="join-hash-symbol">#</span>
              <input
                type="text"
                className="join-text-input"
                placeholder="7F3K2X"
                maxLength={6}
                value={code}
                onChange={e => {
                  setCode(e.target.value.toUpperCase())
                  setError('')
                }}
                autoFocus
              />
            </div>

            {error && (
              <div className="join-error-msg fade-in">
                <span><Icon name="alert" /></span> {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg join-action-btn"
              disabled={loading || !/^[A-Z0-9]{6}$/.test(code.trim())}
            >
              {loading ? 'Connecting to Room…' : 'Join Live Session →'}
            </button>
          </form>

          <div className="join-card-footer-note">
            <p><Icon name="shield" /> <strong>Anonymous classroom questions:</strong> Your name is hidden on classroom questions. Sign-in is used for course access and vote limits.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
