import Icon from '../common/Icon'
import React, { useState, useEffect } from 'react'
import { UserButton } from '@clerk/clerk-react'

export default function SessionHeader({
  session,
  code,
  isTeacher,
  materialsCount = 0,
  onToggleMaterials,
  onCopyCode,
  onEndSession,
  onBack
}) {
  const [elapsedTime, setElapsedTime] = useState('00:00:00')

  useEffect(() => {
    if (!session?.started_at) return
    const start = new Date(session.started_at).getTime()

    const updateTimer = () => {
      const now = Date.now()
      const diffSec = Math.max(0, Math.floor((now - start) / 1000))
      const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0')
      const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0')
      const secs = String(diffSec % 60).padStart(2, '0')
      setElapsedTime(`${hrs}:${mins}:${secs}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [session?.started_at])

  const breadcrumbCourse = session?.course?.course_code || session?.subject || 'Classroom'
  const breadcrumbTitle = session?.title || 'Live Session'

  return (
    <header className="editorial-room-header">
      {/* Left: Brand, Exit and Breadcrumbs */}
      <div className="room-header-breadcrumbs">
        <span className="header-brand-badge" onClick={onBack} title="AskAnon Dashboard">
          /A
        </span>
        <button className="back-nav-btn" onClick={onBack} title="Exit Session to Dashboard">
          ← Exit
        </button>
        <div className="breadcrumbs-track">
          <span className="crumb-course">{breadcrumbCourse}</span>
          <span className="crumb-divider">&gt;</span>
          <span className="crumb-title">{breadcrumbTitle}</span>
        </div>
      </div>

      {/* Right: Live Stopwatch, Attendees, Materials, Session Code, Controls */}
      <div className="room-header-indicators">
        {/* Pulsing Live Timer */}
        <div className="live-status-indicator" title="Live lecture duration">
          <span className="live-red-dot">●</span>
          <span className="live-label">LIVE</span>
          <span className="live-timer-digits">{elapsedTime}</span>
        </div>

        {/* Room Code Badge */}
        <button className="editorial-code-btn" onClick={onCopyCode} title="Click to copy 6-character room code">
          <span className="code-prefix">#</span>
          <span className="code-value">{code}</span>
          <span className="code-copy-tooltip">copy</span>
        </button>

        {/* Lecture Slides & Materials Drawer Trigger */}
        <button
          className="materials-drawer-trigger"
          onClick={onToggleMaterials}
          title="Open lecture slides & handouts vault"
        >
          <span className="materials-icon"><Icon name="folder" /></span>
          <span className="materials-text">Slides & Notes</span>
          <span className="materials-badge">{materialsCount}</span>
        </button>

        {/* Teacher Live Controls */}
        {isTeacher && (
          <div className="teacher-header-controls">
            <button
              className="btn btn-primary btn-sm end-lecture-btn"
              onClick={onEndSession}
              title="End lecture and transition to permanent recap"
            >
              End Lecture
            </button>
          </div>
        )}

        <div className="header-avatar-slot">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  )
}
