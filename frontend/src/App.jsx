import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import JoinSession from './pages/JoinSession'
import SessionRoom from './pages/SessionRoom'
import TokenPage from './pages/TokenPage'


const ProtectedRoute = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return <div className="loading-screen"><span>Loading…</span></div>
  if (!isSignedIn) return <Navigate to="/" replace />
  return children
}
const HomeRoute = () => {
  const { isSignedIn, isLoaded } = useAuth()
  if (!isLoaded) return <div className="loading-screen"><span>Loading…</span></div>
  if (isSignedIn) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/token" element={<TokenPage />} />
        <Route path="/" element={<LandingPage  />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/join" element={<ProtectedRoute><JoinSession /></ProtectedRoute>} />
        <Route path="/session/:code" element={<ProtectedRoute><SessionRoom /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}