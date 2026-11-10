import { useNavigate } from 'react-router-dom'
import { SignInButton, useAuth } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import axios from 'axios'
import './Onboarding.css'

const API = import.meta.env.VITE_API_URL
export default function Onboarding() {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let active = true
    setChecking(true)
    getToken().then(token => axios.get(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })).then(() => {
      if (active) navigate('/dashboard', { replace: true })
    }).catch(err => { if (active && err.response?.status !== 409) setError('Unable to check your profile. Please reload and retry.') }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [isLoaded, isSignedIn, getToken, navigate])
  const chooseRole = async role => {
    if (saving) return
    if (!isSignedIn) return
    setSaving(true); setError('')
    try {
      const token = await getToken()
      const { data } = await axios.post(`${API}/api/users/sync`, { role }, { headers: { Authorization: `Bearer ${token}` } })
      sessionStorage.setItem('db_user', JSON.stringify(data))
      localStorage.removeItem('intended_role')
      navigate('/dashboard', { replace: true })
    } catch (err) { setError(err.response?.data?.error || 'Unable to save your role. Please retry.') }
    finally { setSaving(false) }
  }
  const card = (role, title, description) => <button type="button" className={`role-card ${role === 'teacher' ? 'faculty' : ''}`} disabled={!isLoaded || checking || saving} onClick={() => chooseRole(role)}><span className="role-icon">{role === 'teacher' ? 'T' : 'S'}</span><h2 className="role-name">{title}</h2><p className="role-desc">{description}</p></button>
  return <div className="onboarding-page"><main className="onboarding-container">
    <h1 className="onboarding-title">{isSignedIn ? 'How will you use AskAnon?' : 'Welcome to AskAnon'}</h1>
    <p className="onboarding-subtitle">{isSignedIn ? 'Choose once when registering. Your saved role opens the right dashboard on every sign-in.' : 'Sign in or create an account to continue. New users choose Student or Teacher after signing in.'}</p>
    {error && <p role="alert">{error}</p>}
    {(checking || saving) && <p role="status">{saving ? 'Saving your workspace...' : 'Checking your profile...'}</p>}
    {isSignedIn ? <div className="role-cards">
      {card('student', 'I am a Student', 'Join lectures by code, ask questions and revisit your course materials.')}
      {card('teacher', 'I am a Teacher', 'Create lectures, answer questions and organize your course vaults.')}
    </div> : <SignInButton mode="modal"><button className="btn btn-primary" disabled={!isLoaded}>Sign in / Create account</button></SignInButton>}
    <p className="onboarding-subtitle">No university registration or approval is required. Teachers control only the lectures and courses they own.</p>
    <button className="btn btn-ghost btn-sm back-btn" disabled={saving} onClick={() => navigate('/')}>Back to home</button>
  </main></div>
}
