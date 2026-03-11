import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, UserButton , useAuth } from '@clerk/clerk-react'
import axios from 'axios'
import './JoinSession.css'

const API = import.meta.env.VITE_API_URL

export default function JoinSession() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
    const { getToken } = useAuth()


  const handleJoin = async () => {
    if (code.trim().length < 6) {
      setError('Please enter a valid 6-character code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      await axios.get(`${API}/api/sessions/${code.toUpperCase()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      navigate(`/session/${code.toUpperCase()}`)
    } catch (err) {
      if (err.response?.status === 404) setError('Session not found. Check the code and try again.')
      else if (err.response?.status === 400) setError('This session has already ended.')
      else setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleJoin()
  }

  return (
    <div className="join-page">
      {/* BG accent */}
      <div className="join-glow" aria-hidden />

      {/* Nav */}
      <nav className="join-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>
        <UserButton afterSignOutUrl="/" />
      </nav>

      {/* Card */}
      <div className="join-center">
        <div className="join-card card fade-up">
          <div className="join-header">
            <span className="join-icon">↗</span>
            <h1>Join a Session</h1>
            <p>Enter the 6-character code your teacher shared</p>
          </div>

          <div className="code-input-row">
            <input
              className="input code-input"
              placeholder="ABC123"
              value={code}
              maxLength={6}
              onChange={e => {
                setCode(e.target.value.toUpperCase())
                setError('')
              }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {error && (
            <div className="join-error fade-in">
              <span>⚠</span> {error}
            </div>
          )}

          <button
            className="btn btn-primary join-btn"
            onClick={handleJoin}
            disabled={loading || code.length < 6}
          >
            {loading ? 'Checking…' : 'Join Session →'}
          </button>

          <p className="join-note">
            You'll join anonymously — your name won't be visible to anyone
          </p>
        </div>
      </div>
    </div>
  )
}