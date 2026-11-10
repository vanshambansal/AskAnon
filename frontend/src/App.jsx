import { useEffect, lazy, Suspense, Fragment } from 'react'
import { setDownloadTokenProvider } from './utils/downloadHelper'
import useDialogAccessibility from './hooks/useDialogAccessibility'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import LandingPage from './pages/LandingPage'
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const JoinSession = lazy(() => import('./pages/JoinSession'))
const SessionRoom = lazy(() => import('./pages/SessionRoom'))
const SessionRecap = lazy(() => import('./pages/SessionRecap'))
const CourseDetail = lazy(() => import('./pages/CourseDetail'))
import ErrorBoundary from './components/common/ErrorBoundary'
const NetworkProgress = lazy(() => import('./components/common/NetworkProgress'))
import { PageSkeleton } from './components/common/AsyncFeedback'

const ProtectedRoute = ({ children }) => {
  const { isSignedIn, isLoaded, userId } = useAuth()
  if (!isLoaded) return <PageSkeleton label="Checking your sign-in..." />
  if (!isSignedIn) return <Navigate to="/" replace />
  return <Fragment key={userId}><NetworkProgress />{children}</Fragment>
}
const HomeRoute = () => <LandingPage />

export default function App() {
  useDialogAccessibility()
  const { getToken } = useAuth()
  useEffect(() => {
    setDownloadTokenProvider(getToken)
    return () => setDownloadTokenProvider(null)
  }, [getToken])
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/join" element={<ProtectedRoute><JoinSession /></ProtectedRoute>} />
          <Route path="/session/:code" element={<ProtectedRoute><SessionRoom /></ProtectedRoute>} />
          <Route path="/session/:code/recap" element={<ProtectedRoute><SessionRecap /></ProtectedRoute>} />
          <Route path="/courses/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
          <Route path="*" element={<main className="not-found-page"><span className="brand-badge">/A</span><h1>Page not found</h1><p>This link does not match an AskAnon page.</p><Link className="btn btn-primary" to="/dashboard">Open dashboard</Link><Link to="/">Back to home</Link></main>} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
