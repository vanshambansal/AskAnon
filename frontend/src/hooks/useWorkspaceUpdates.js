import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { io } from 'socket.io-client'
import { invalidateResources } from '../utils/resourceCache.mjs'

// Keep resource pages current without recreating a socket on every render.
export default function useWorkspaceUpdates({ onChange, onSessionDeleted, onCourseDeleted }) {
  const { getToken, userId } = useAuth()
  const callbacks = useRef({})
  useEffect(() => { callbacks.current = { onChange, onSessionDeleted, onCourseDeleted } }, [onChange, onSessionDeleted, onCourseDeleted])
  useEffect(() => {
    if (!userId) return
    let active = true
    let timer
    const socket = io(import.meta.env.VITE_API_URL, { autoConnect: false, transports: ['websocket'], auth: async done => {
      try { const token = await getToken(); if (active) done({ token }) } catch { if (active) done({ token: null }) }
    } })
    const refresh = event => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (active) callbacks.current.onChange?.(event || { reason: 'reconnect' }) }, 200)
    }
    const deleted = event => callbacks.current.onSessionDeleted?.(event.sessionIds || [event.sessionId])
    socket.on('workspace-ready', () => refresh({ reason: 'reconnect' }))
    socket.on('workspace-updated', event => { invalidateResources(); refresh(event) })
    socket.on('session-deleted', event => { invalidateResources(); deleted(event) })
    socket.on('sessions-batch-deleted', event => { invalidateResources(); deleted(event) })
    socket.on('course-deleted', event => { invalidateResources(); callbacks.current.onCourseDeleted?.(event.courseId) })
    const focus = () => refresh({ reason: 'focus' })
    window.addEventListener('focus', focus)
    socket.connect()
    return () => { active = false; clearTimeout(timer); socket.disconnect(); window.removeEventListener('focus', focus) }
  }, [getToken, userId])
}
