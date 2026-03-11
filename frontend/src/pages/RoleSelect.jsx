import { useState } from 'react'
import { useUser , useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './RoleSelect.css'

const API = import.meta.env.VITE_API_URL

export default function RoleSelect() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const { getToken } = useAuth()

  const confirm = async () => {
    if (!selected) return
    setLoading(true)
    try {
        const token = await getToken({ template: 'default' })
      console.log('Token:', token)
      await axios.post(`${API}/api/users/sync`,
        {
          clerk_user_id: user.id,
          email: user.emailAddresses[0].emailAddress,
          name: user.fullName,
          role: selected
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    window.location.href = selected === 'teacher' ? '/dashboard' : '/join'
    } catch (err) {
      console.error('Role select error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="role-page">
      <div className="role-card card fade-up">
        <h1 className="role-title">Welcome to AskAnon</h1>
        <p className="role-sub">How will you be using the platform?</p>

        <div className="role-options">
          {[
            { value: 'teacher', icon: '🎓', label: 'I\'m a Teacher', desc: 'Create sessions, see questions, moderate' },
            { value: 'student', icon: '📚', label: 'I\'m a Student', desc: 'Join sessions, ask questions anonymously' },
          ].map(r => (
            <button
              key={r.value}
              className={`role-option ${selected === r.value ? 'active' : ''}`}
              onClick={() => setSelected(r.value)}
            >
              <span className="role-icon">{r.icon}</span>
              <span className="role-label">{r.label}</span>
              <span className="role-desc">{r.desc}</span>
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary role-confirm"
          onClick={confirm}
          disabled={!selected || loading}
        >
          {loading ? 'Setting up…' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}