import ProgressiveList from '../components/common/ProgressiveList'
import { BusyButton, PageSkeleton } from '../components/common/AsyncFeedback'
import { readResource, peekResource, invalidateResources, resourceVersion } from '../utils/resourceCache.mjs'
import usePendingActions from '../hooks/usePendingActions'
import Icon from '../components/common/Icon'
import { useState, useEffect, useEffectEvent, useRef } from 'react'
import { useUser, useAuth, UserButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { io } from 'socket.io-client'
import FacultyHomeTab from '../components/dashboard/FacultyHomeTab'
import FacultySessionsTab from '../components/dashboard/FacultySessionsTab'
import FacultyDoubtsTab from '../components/dashboard/FacultyDoubtsTab'
import FacultyCoursesTab from '../components/dashboard/FacultyCoursesTab'
import DashboardModals from '../components/dashboard/DashboardModals'
import './Dashboard.css'

const API = import.meta.env.VITE_API_URL

export default function Dashboard() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { pending: pendingActions, run: runAction } = usePendingActions()

  const [dbUser, setDbUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('db_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const dataRequest = useRef(0)
  const [sessions, setSessions] = useState([])
  const [activeSessions, setActiveSessions] = useState([])
  const [courses, setCourses] = useState([])
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'sessions' | 'doubts' | 'courses'

  // Student quick join input state
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const joining = false

  // Teacher Modals & Forms
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateCourse, setShowCreateCourse] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '', course_id: '' })
  const [courseForm, setCourseForm] = useState({ course_code: '', title: '', description: '' })

  // Vault Upload state
  const [uploadingForCourse, setUploadingForCourse] = useState(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('Lecture Slides')
  const [uploadFile, setUploadFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const [creating, setCreating] = useState(false)
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [loading, setLoading] = useState(() => {
    try {
      return !sessionStorage.getItem('db_user')
    } catch {
      return true
    }
  })
  const [initError, setInitError] = useState(null)
  const [toast, setToast] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [sessionToDelete, setSessionToDelete] = useState(null)

  // Sessions Tab Search, Filter, Multi-Select & Modals
  const [sessionSearch, setSessionSearch] = useState('')
  const [sessionCourseFilter, setSessionCourseFilter] = useState('all')
  const [sessionStatusFilter, setSessionStatusFilter] = useState('all')
  const [sessionSort, setSessionSort] = useState('newest')
  const [selectedSessions, setSelectedSessions] = useState([])
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)
  const [taggingSession, setTaggingSession] = useState(null)
  const [sessionEditMode, setSessionEditMode] = useState(false)

  // Doubts Tab Filters
  const [doubtsCourseFilter, setDoubtsCourseFilter] = useState('all')
  const [doubtsSessionFilter, setDoubtsSessionFilter] = useState('all')

  // Courses Tab Search
  const [courseSearch, setCourseSearch] = useState('')

  // Student Saved Doubts & Past Sessions State
  const [savedBookmarks, setSavedBookmarks] = useState([])
  const [studentPastSessions, setStudentPastSessions] = useState([])
  const [courseToLeave, setCourseToLeave] = useState(null)

  // Student Tab Navigation & Search / Filter States
  const [studentTab, setStudentTab] = useState('courses') // 'courses' | 'lectures' | 'notebook'
  const [studentCourseSearch, setStudentCourseSearch] = useState('')
  const [studentLectureSearch, setStudentLectureSearch] = useState('')
  const [studentLectureCourseFilter, setStudentLectureCourseFilter] = useState('all')
  const [studentNotebookSearch, setStudentNotebookSearch] = useState('')
  const [studentNotebookCourseFilter, setStudentNotebookCourseFilter] = useState('all')
  const [fetchingData, setFetchingData] = useState(true)

  const initialize = useEffectEvent(() => init())
  useEffect(() => {
    if (user) initialize()
  }, [user])

  // Refresh authoritative lists after server notifications; never decrement counts twice.
  useEffect(() => {
    if (!API || !dbUser?.id) return
    let cancelled = false
    let timer
    const socket = io(API, { transports: ['websocket'], auth: async callback => {
      try { callback({ token: await getToken() }) } catch { callback({ token: null }) }
    } })
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        try { const token = await getToken(); if (!cancelled) await fetchRoleData(dbUser.id, dbUser.role, token, true) }
        catch { if (!cancelled) setInitError('Live updates could not refresh. Please retry.') }
      }, 150)
    }
    const prune = ids => {
      invalidateResources()
      const deleted = new Set(ids)
      setSessions(prev => prev.filter(s => !deleted.has(s.id)))
      setActiveSessions(prev => prev.filter(s => !deleted.has(s.id)))
      setStudentPastSessions(prev => prev.filter(s => !deleted.has(s.id)))
      setSavedBookmarks(prev => prev.filter(b => !deleted.has(b.question?.session_id)))
      setSelectedSessions(prev => prev.filter(id => !deleted.has(id)))
      setSessionToDelete(prev => deleted.has(prev?.id) ? null : prev)
      refresh()
    }
    socket.on('connect', refresh)
    socket.on('workspace-ready', refresh)
    // Enrollment/leave endpoints maintain socket membership. Rebuilding every
    // room on each question update adds DB reads and a second ready/refresh cycle.
    socket.on('workspace-updated', () => { invalidateResources(); refresh() })
    socket.on('session-deleted', event => prune([event.sessionId]))
    socket.on('sessions-batch-deleted', event => prune(event.sessionIds))
    socket.on('course-deleted', event => { setCourses(prev => prev.filter(c => c.id !== event.courseId)); refresh() })
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; clearTimeout(timer); socket.disconnect(); window.removeEventListener('focus', refresh) }
  }, [dbUser?.id, dbUser?.role, getToken])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const studentTabRef = useRef('courses')
  const [loadedStudentTabs, setLoadedStudentTabs] = useState(new Set())
  const fetchRoleData = async (userId, role, token, quiet = false, view = studentTabRef.current) => {
    const request = ++dataRequest.current
    const key = `dashboard:${userId}:${role}:${view}`
    const apply = data => {
      if (role === 'teacher') { setSessions(data.sessions); setCourses(data.courses) }
      else {
        setActiveSessions(data.live); setCourses(data.courses)
        if (data.bookmarks !== null) setSavedBookmarks(data.bookmarks)
        if (data.history !== null) setStudentPastSessions(data.history)
        setLoadedStudentTabs(prev => new Set([...prev, view]))
      }
    }
    const cached = peekResource(key)
    if (cached) { apply(cached); setFetchingData(false); setLoading(false) }
    else if (!quiet) setFetchingData(true)
    try {
      const version = resourceVersion()
      const data = await readResource(key, async () => {
        const headers = { Authorization: `Bearer ${token}` }
        if (role === 'teacher') {
          const [rooms, vaults] = await Promise.all([
            axios.get(`${API}/api/sessions/teacher/${userId}`, { headers }),
            axios.get(`${API}/api/courses/teacher/${userId}`, { headers })
          ])
          return { sessions: rooms.data, courses: vaults.data }
        }
        const [live, vaults, notebook, history] = await Promise.all([
          axios.get(`${API}/api/sessions/active/student/${userId}`, { headers }),
          axios.get(`${API}/api/courses/enrolled/${userId}`, { headers }),
          view === 'notebook' ? axios.get(`${API}/api/bookmarks/my`, { headers }) : null,
          view === 'lectures' ? axios.get(`${API}/api/sessions/history/student/${userId}`, { headers }) : null
        ])
        return { live: live.data, courses: vaults.data, bookmarks: notebook?.data ?? null, history: history?.data ?? null }
      }, { fresh: quiet === true || Boolean(cached) })
      if (request !== dataRequest.current || version !== resourceVersion()) return
      apply(data)
      setInitError(null)
    } catch (error) {
      if (request === dataRequest.current) {
        if ([401, 403].includes(error.response?.status)) {
          invalidateResources(); setSessions([]); setCourses([]); setActiveSessions([]); setSavedBookmarks([]); setStudentPastSessions([])
        }
        setInitError(error.response?.data?.error || 'Could not refresh this view. Existing content is retained; retry to update it.')
      }
      throw error
    } finally { if (request === dataRequest.current) setFetchingData(false) }
  }
  const selectStudentTab = async tab => {
    studentTabRef.current = tab
    setStudentTab(tab)
    setFetchingData(true)
    try { const token = await getToken(); await fetchRoleData(dbUser.id, dbUser.role, token, false, tab) }
    catch { /* The view shows a retryable error without inventing an empty result. */ }
  }

  const deletionGroups = [...new Map(sessions.filter(s => s.deletionJob).map(s => [s.deletionJob.id, s.deletionJob])).values()]
  const hasPendingDeletion = deletionGroups.some(job => ['QUEUED', 'RUNNING'].includes(job.status))
  const refreshDeletionProgress = useEffectEvent(async () => {
    try { const token = await getToken(); await fetchRoleData(dbUser.id, dbUser.role, token, true) } catch { /* The retry banner remains visible. */ }
  })
  useEffect(() => {
    if (!hasPendingDeletion) return
    const timer = setInterval(() => refreshDeletionProgress(), 5000)
    return () => clearInterval(timer)
  }, [hasPendingDeletion])
  const retryDeletion = jobId => runAction(`retry-delete:${jobId}`, async () => {
    try {
      const token = await getToken()
      await axios.post(`${API}/api/sessions/deletion-jobs/${jobId}/retry`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setSessions(prev => prev.map(s => s.deletion_job_id === jobId ? { ...s, deletionJob: { ...s.deletionJob, status: 'QUEUED', error: null } } : s))
      showToast('Deletion will resume in the background.')
    } catch (err) { showToast(err.response?.data?.error || 'Could not retry deletion.', 'error') }
  })

  const init = async () => {
    setInitError(null)
    try {
      const token = await getToken()
      const intendedRole = localStorage.getItem('intended_role')

      const cachedUserStr = sessionStorage.getItem('db_user')
      let cachedUser = null
      try {
        cachedUser = cachedUserStr ? JSON.parse(cachedUserStr) : null
      } catch { /* Ignore an invalid cached value. */ }

      const isCacheValid = cachedUser && cachedUser.clerk_user_id === user.id

      const syncPayload = {
        clerk_user_id: user.id,
        email: user.emailAddresses?.[0]?.emailAddress,
        name: user.fullName || user.firstName
      }
      if (intendedRole) {
        syncPayload.role = intendedRole
      }

      if (isCacheValid && !intendedRole) {
        // Fast path: load dashboard data immediately using cached credentials
        setDbUser(cachedUser)
        const dataPromise = fetchRoleData(cachedUser.id, cachedUser.role, token)
        const syncPromise = axios.post(
          `${API}/api/users/sync`,
          syncPayload,
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(syncError => ({ syncError }))

        // Wait for data so page displays instantly
        await dataPromise
        setLoading(false)

        // Background update session storage if synced user has modifications
        const syncRes = await syncPromise
        if (syncRes.syncError) throw syncRes.syncError
        sessionStorage.setItem('db_user', JSON.stringify(syncRes.data))
        if (syncRes.data.role !== cachedUser.role) {
          setDbUser(syncRes.data)
          await fetchRoleData(syncRes.data.id, syncRes.data.role, token)
        }
      } else {
        // Cold start or role change: sync first
        setLoading(true)
        const syncRes = await axios.post(
          `${API}/api/users/sync`,
          syncPayload,
          { headers: { Authorization: `Bearer ${token}` } }
        )

        if (intendedRole) {
          localStorage.removeItem('intended_role')
        }

        const freshUser = syncRes.data
        setDbUser(freshUser)
        sessionStorage.setItem('db_user', JSON.stringify(freshUser))

        await fetchRoleData(freshUser.id, freshUser.role, token)
        setLoading(false)
      }
    } catch (err) {
      if (err.response?.data?.code === 'ROLE_REQUIRED') { navigate('/onboarding', { replace: true }); return }
      if (err.response?.data?.code === 'ROLE_IMMUTABLE') { localStorage.removeItem('intended_role'); await init(); return }
      console.error('Init error:', err)
      setInitError(err.response?.data?.error || 'Unable to load your workspace. Check your connection and retry.')
      setLoading(false)
    }
  }

  const handleStudentJoin = (e) => {
    e?.preventDefault()
    const clean = joinCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      setJoinError('Please enter a valid session code')
      return
    }
    setJoinError('')
    navigate(`/session/${clean}`)
  }

  const handleLeaveCourse = (e, course) => {
    e.stopPropagation()
    setCourseToLeave(course)
  }

  const confirmLeaveCourse = async () => {
    return runAction('leave', async () => {
      if (!courseToLeave) return
      try {
        const token = await getToken()
        await axios.delete(`${API}/api/courses/enroll/${courseToLeave.id}?user_id=${dbUser.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setCourses(prev => prev.filter(c => c.id !== courseToLeave.id))
        setStudentPastSessions(prev => prev.filter(s => s.course_id !== courseToLeave.id))
        setActiveSessions(prev => prev.filter(s => s.course_id !== courseToLeave.id))
        setCourseToLeave(null)
        showToast(`Left ${courseToLeave.title || 'course'}`)
      } catch (err) {
        console.error('Leave course error:', err)
        showToast(err.response?.data?.error || 'Failed to leave course', 'error')
      }

    })
  }

  const handleRemoveBookmark = async (questionId) => {
    return runAction(`bookmark:${questionId}`, async () => {
      try {
        const token = await getToken()
        await axios.post(
          `${API}/api/bookmarks/${questionId}/toggle`,
          { user_id: dbUser.id },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setSavedBookmarks(prev => prev.filter(b => b.question_id !== questionId))
        showToast('Removed from saved doubts')
      } catch (err) {
        console.error('Remove bookmark error:', err)
        showToast('Failed to remove bookmark', 'error')
      }

    })
  }

  const createSession = async () => {
    if (!form.title.trim() || creating) return
    setCreating(true)
    try {
      const token = await getToken()
      const res = await axios.post(
        `${API}/api/sessions`,
        {
          title: form.title,
          subject: form.subject,
          course_id: form.course_id ? parseInt(form.course_id) : null,
          teacher_id: dbUser.id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setShowCreate(false)
      setForm({ title: '', subject: '', course_id: '' })
      navigate(`/session/${res.data.session_code}?role=teacher`)
    } catch (err) {
      console.error('Create error:', err)
      showToast(err.response?.data?.error || 'Failed to create session', 'error')
    } finally {
      setCreating(false)
    }
  }

  const createCourse = async () => {
    if (!courseForm.course_code.trim() || !courseForm.title.trim() || creatingCourse) return
    setCreatingCourse(true)
    try {
      const token = await getToken()
      const res = await axios.post(
        `${API}/api/courses`,
        {
          course_code: courseForm.course_code.trim().toUpperCase(),
          title: courseForm.title.trim(),
          description: courseForm.description.trim() || null,
          teacher_id: dbUser.id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setCourses(prev => [res.data, ...prev.filter(course => course.id !== res.data.id)])
      setShowCreateCourse(false)
      setCourseForm({ course_code: '', title: '', description: '' })
      showToast(`Course "${res.data.course_code}" created`)
    } catch (err) {
      console.error('Create course error:', err)
      showToast(err.response?.data?.error || 'Failed to create course', 'error')
    } finally {
      setCreatingCourse(false)
    }
  }

  const triggerDeleteSession = (s) => {
    setSessionToDelete(s)
  }

  const confirmDeleteSession = async () => {
    return runAction('delete', async () => {
      if (!sessionToDelete) return
      setDeleting(sessionToDelete.id)
      try {
        const token = await getToken()
        const result = await axios.delete(`${API}/api/sessions/${sessionToDelete.id}`, { headers: { Authorization: `Bearer ${token}` } })

        setSessions(prev => prev.map(x => x.id === sessionToDelete.id ? { ...x, deletion_job_id: result.data.job.id, deletionJob: result.data.job } : x))
        setActiveSessions(prev => prev.filter(x => x.id !== sessionToDelete.id))
        setStudentPastSessions(prev => prev.filter(x => x.id !== sessionToDelete.id))
        setSelectedSessions(prev => prev.filter(id => id !== sessionToDelete.id))
        showToast(`Deletion queued for #${sessionToDelete.session_code}. You can keep working.`)
        setSessionToDelete(null)
        void fetchRoleData(dbUser.id, dbUser.role, token, true).catch(() => {})
      } catch (err) {
        console.error('Delete error:', err)
        showToast(err.response?.data?.error || 'Failed to delete session', 'error')
      } finally {
        setDeleting(null)
      }

    })
  }

  const handleEndSession = async (s) => {
    return runAction(`end:${s.id}`, async () => {
      try {
        const token = await getToken()
        await axios.patch(`${API}/api/sessions/${s.id}/end`, {}, { headers: { Authorization: `Bearer ${token}` } })
        setSessions(prev => prev.map(x => x.id === s.id ? { ...x, is_active: false, ended_at: new Date() } : x))
        void fetchRoleData(dbUser.id, dbUser.role, token, true).catch(() => {})
        showToast(`Concluded lecture "${s.title}"`)
      } catch (err) {
        console.error('End session error:', err)
        showToast('Failed to end session', 'error')
      }

    })
  }

  const copyRoomLink = (sessionCode) => {
    const link = `${window.location.origin}/session/${sessionCode}`
    navigator.clipboard.writeText(link)
    showToast(`Copied room link: #${sessionCode}`)
  }

  const getElapsedTime = (startedAt) => {
    if (!startedAt) return ''
    const diffMs = Date.now() - new Date(startedAt).getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just started'
    if (mins < 60) return `Running for ${mins}m`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `Running for ${hrs}h ${remMins}m`
  }

  const handleMarkAnswered = async (questionId) => {
    return runAction(`answer:${questionId}`, async () => {
      try {
        const token = await getToken()
        await axios.patch(`${API}/api/questions/${questionId}/answer`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setSessions(prev => prev.map(s => ({
          ...s,
          questions: (s.questions || []).map(q =>
            q.id === questionId ? { ...q, is_answered: true, status: 'ANSWERED' } : q
          )
        })))
        showToast('Doubt marked as answered!')
      } catch (err) {
        console.error('Mark answered error:', err)
        showToast('Failed to update doubt', 'error')
      }

    })
  }

  // Sessions Multi-Select & Batch Actions
  const toggleSelectSession = (id) => {
    setSelectedSessions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAllFiltered = () => {
    if (selectedSessions.length === filteredSessions.length) {
      setSelectedSessions([])
    } else {
      setSelectedSessions(filteredSessions.map(s => s.id))
    }
  }

  const handleBatchDelete = async () => {
    return runAction('batch-delete', async () => {
      if (selectedSessions.length === 0) return
      setIsBatchDeleting(true)
      try {
        const token = await getToken()
        const result = await axios.post(`${API}/api/sessions/batch-delete`, {
          sessionIds: selectedSessions
        }, {
          headers: { Authorization: `Bearer ${token}` }
        })

        // Update local state for sessions and courses
        setSessions(prev => prev.map(s => selectedSessions.includes(s.id) ? { ...s, deletion_job_id: result.data.job.id, deletionJob: result.data.job } : s))
        setActiveSessions(prev => prev.filter(s => !selectedSessions.includes(s.id)))
        setStudentPastSessions(prev => prev.filter(s => !selectedSessions.includes(s.id)))

        void fetchRoleData(dbUser.id, dbUser.role, token, true).catch(() => {})
        showToast(`Deletion queued for ${selectedSessions.length} lectures. You can keep working.`)
        setSelectedSessions([])
        setShowBatchDeleteModal(false)
      } catch (err) {
        console.error('Batch delete error:', err)
        showToast('Failed to delete sessions', 'error')
      } finally {
        setIsBatchDeleting(false)
      }

    })
  }

  const handleAssignCourse = async (sessionId, courseId) => {
    return runAction('assign', async () => {
      try {
        const token = await getToken()
        const res = await axios.patch(
          `${API}/api/sessions/${sessionId}/course`,
          { course_id: courseId ? parseInt(courseId) : null },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...res.data } : s))
        void fetchRoleData(dbUser.id, dbUser.role, token, true).catch(() => {})
        showToast('Course assignment updated')
        setTaggingSession(null)
      } catch (err) {
        console.error('Course assign error:', err)
        showToast('Failed to update course', 'error')
      }

    })
  }

  const handleUploadCourseMaterial = async (courseId) => {
    if (!uploadFile) {
      showToast('Please select a file to upload', 'error')
      return
    }
    if (!uploadTitle.trim()) {
      showToast('Please provide a title for the material', 'error')
      return
    }

    if (isUploading) return
    if (uploadFile.size > 25 * 1024 * 1024) { showToast('Choose a file smaller than 25 MB', 'error'); return }
    setIsUploading(true)
    const formData = new FormData()
    formData.append('title', uploadTitle.trim())
    formData.append('course_id', courseId)
    formData.append('category', uploadCategory)
    formData.append('file', uploadFile)

    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/materials/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      })

      setCourses(prev => prev.map(c => {
        if (c.id === courseId) {
          return {
            ...c,
            _count: { ...c._count, materials: (c._count?.materials || 0) + ((c.materials || []).some(material => material.id === res.data.id) ? 0 : 1) },
            materials: [res.data, ...(c.materials || []).filter(material => material.id !== res.data.id)]
          }
        }
        return c
      }))

      setUploadFile(null)
      setUploadTitle('')
      setUploadingForCourse(null)
      showToast('Study material attached to course vault!')
    } catch (err) {
      console.error('Upload material error:', err)
      showToast(err.response?.data?.error || 'Failed to upload material', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const isTeacher = dbUser?.role === 'teacher'

  // Teacher computed metrics
  const activeRooms = sessions.filter(s => s.is_active && !s.deletion_job_id)
  const endedSessions = sessions.filter(s => !s.is_active && !s.deletion_job_id)
  const allTeacherQuestions = sessions.filter(s => !s.deletion_job_id).flatMap(s => (s.questions || []).filter(q => (!q.content_type || q.content_type === 'QUESTION') && !['FLAGGED', 'DISMISSED'].includes(q.status)).map(q => ({
    ...q,
    sessionCode: s.session_code,
    sessionTitle: s.title,
    sessionId: s.id,
    courseCode: s.course?.course_code || 'ROOM',
    courseId: s.course_id || null
  })))
  const unresolvedDoubts = allTeacherQuestions
    .filter(q => !q.is_answered && q.status !== 'ANSWERED' && q.status !== 'DISMISSED')
    .sort((a, b) => b.upvotes - a.upvotes)

  // Strip instructor broadcast prefixes from question text for display
  const stripInstructorPrefix = (text) => {
    if (!text) return ''
    return text
      .replace(/^👨‍🏫 \[Instructor Note\]/i, '')
      .replace(/^👨‍🏫 \[Instructor Code\]/i, '')
      .replace(/^👨‍🏫/i, '')
      .trim()
  }

  // Filtered doubts for Doubts tab
  const filteredDoubts = unresolvedDoubts.filter(q => {
    if (doubtsCourseFilter !== 'all' && String(q.courseId) !== String(doubtsCourseFilter)) return false
    if (doubtsSessionFilter !== 'all' && String(q.sessionId) !== String(doubtsSessionFilter)) return false
    return true
  })

  // Filtered & Sorted sessions for Sessions tab
  const filteredSessions = sessions.filter(s => {
    if (s.deletion_job_id) return false
    if (sessionSearch.trim()) {
      const q = sessionSearch.trim().toLowerCase()
      const matchCode = (s.session_code || '').toLowerCase().includes(q)
      const matchTitle = (s.title || '').toLowerCase().includes(q)
      const matchSub = (s.subject || '').toLowerCase().includes(q)
      const matchCourse = (s.course?.course_code || '').toLowerCase().includes(q)
      if (!matchCode && !matchTitle && !matchSub && !matchCourse) return false
    }

    if (sessionCourseFilter !== 'all') {
      if (sessionCourseFilter === 'unassigned') {
        if (s.course_id || s.course) return false
      } else {
        if (String(s.course_id) !== String(sessionCourseFilter)) return false
      }
    }

    if (sessionStatusFilter === 'live' && !s.is_active) return false
    if (sessionStatusFilter === 'ended' && s.is_active) return false

    return true
  }).sort((a, b) => {
    if (sessionSort === 'oldest') {
      return new Date(a.started_at) - new Date(b.started_at)
    }
    if (sessionSort === 'questions') {
      const countA = a._count?.questions || a.questions?.length || 0
      const countB = b._count?.questions || b.questions?.length || 0
      return countB - countA
    }
    return new Date(b.started_at) - new Date(a.started_at)
  })

  // Filtered courses for Courses tab
  const filteredTeacherCourses = courses.filter(c => {
    if (!courseSearch.trim()) return true
    const q = courseSearch.trim().toLowerCase()
    const matchCode = (c.course_code || '').toLowerCase().includes(q)
    const matchTitle = (c.title || '').toLowerCase().includes(q)
    const matchDesc = (c.description || '').toLowerCase().includes(q)
    return matchCode || matchTitle || matchDesc
  })

  // Filtered lists for Student Workspace
  const filteredStudentCourses = courses.filter((c) => {
    if (!studentCourseSearch.trim()) return true
    const q = studentCourseSearch.trim().toLowerCase()
    return (
      (c.course_code || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    )
  })

  const filteredStudentLectures = studentPastSessions.filter((s) => {
    const q = studentLectureSearch.trim().toLowerCase()
    const matchesSearch =
      !q ||
      (s.title || '').toLowerCase().includes(q) ||
      (s.subject || '').toLowerCase().includes(q) ||
      (s.session_code || '').toLowerCase().includes(q) ||
      (s.course?.course_code || '').toLowerCase().includes(q) ||
      (s.course?.title || '').toLowerCase().includes(q)

    const matchesCourse =
      studentLectureCourseFilter === 'all' || String(s.course_id) === String(studentLectureCourseFilter)
    return matchesSearch && matchesCourse
  })

  const filteredSavedBookmarks = savedBookmarks.filter((b) => {
    const qText = studentNotebookSearch.trim().toLowerCase()
    const q = b.question
    const sess = q?.session
    const course = sess?.course

    const matchesSearch =
      !qText ||
      (q?.question_text || '').toLowerCase().includes(qText) ||
      (q?.answer_text || '').toLowerCase().includes(qText) ||
      (q?.code_snippet || '').toLowerCase().includes(qText) ||
      (course?.course_code || '').toLowerCase().includes(qText) ||
      (sess?.title || '').toLowerCase().includes(qText)

    const matchesCourse =
      studentNotebookCourseFilter === 'all' || String(course?.id) === String(studentNotebookCourseFilter)
    return matchesSearch && matchesCourse
  })

  if (loading) return <PageSkeleton label="Opening your classroom workspace..." />

  // Dynamic time-based greeting (Morning / Afternoon / Evening)
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Clean user display name: prioritize firstName, then fullName, then email username
  const rawDisplayName = user?.firstName || user?.fullName || (user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || '')
  const displayName = rawDisplayName ? (rawDisplayName.charAt(0).toUpperCase() + rawDisplayName.slice(1)) : ''

  return (
    <div className={`dash-workspace ${isTeacher ? 'theme-faculty' : 'theme-student'}`}>
      {/*  TOPBAR NAVIGATION  */}
      <header className="dash-topbar">
        <div className="topbar-left">
          {/* Logo navigates to landing page as requested */}
          <div className="dash-logo" onClick={() => navigate('/')} title="Return to Landing Page">
            <span className="brand-badge">/A</span>
            <span className="brand-name">AskAnon</span>
          </div>
          <button className="nav-landing-link" onClick={() => navigate('/')}>
            ← Landing Page
          </button>
        </div>

        <div className="topbar-right">
          <span className="workspace-role-label">{isTeacher ? 'Teacher workspace' : 'Student workspace'}</span>
          <div className="user-profile-wrapper">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/*  ERROR RECONNECTION BANNER  */}
      {initError && (
        <div className="connection-error-banner">
          <span><Icon name="alert" /> {initError}</span>
          <button onClick={() => init()} className="btn btn-secondary btn-sm">
            Retry Connection
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STUDENT VIEW (WARM PAPER EDITORIAL THEME)
          ═══════════════════════════════════════════════════════════════ */}
      {isTeacher && deletionGroups.some(job => job.status === 'FAILED') && <section className="deletion-status-panel" aria-label="Lecture deletion progress">
        {deletionGroups.filter(job => job.status === 'FAILED').map(job => <div key={job.id}>
          <span role="status">{job.status !== 'FAILED' && <span className="operation-spinner" aria-hidden="true" />}
            {job.status === 'FAILED' ? 'Lecture deletion needs attention.' : 'Lecture cleanup is running in the background. You can keep working.'}
          </span>
          {job.status === 'FAILED' && <><p>{job.error}</p><BusyButton className="btn btn-secondary btn-sm" busy={pendingActions.has(`retry-delete:${job.id}`)} onClick={() => retryDeletion(job.id)}>Retry deletion</BusyButton></>}
        </div>)}
      </section>}
      {!isTeacher ? (
        <main className="student-dashboard fade-up">
          {/* Header Greeting */}
          <section className="student-header">
            <div className="student-header-text">
              <span className="student-eyebrow">STUDENT LEARNING WORKSPACE</span>
              <h1 className="student-greeting">
                {timeGreeting}, <em>{displayName || 'Scholar'}.</em>
              </h1>
              <p className="student-sub">
                Ask anonymous questions during live lectures, explore course study vaults, and review past lecture recaps.
              </p>
            </div>
          </section>

          {/* Global Join Live Session Hero */}
          <section className="student-join-hero" style={{ marginBottom: '32px' }}>
            <div className="join-hero-card">
              <div className="join-card-header">
                <span className="join-card-tag">ATTEND A LECTURE</span>
                <h2 className="join-card-title">Join Live Session</h2>
                <p className="join-card-desc">Enter the 6-character room code displayed on your professor's screen.</p>
              </div>

              <form className="join-card-form" onSubmit={handleStudentJoin}>
                <div className="join-input-box">
                  <span className="join-hash">#</span>
                  <input
                    type="text"
                    className="join-big-input"
                    placeholder="4M7Q2X"
                    maxLength={6}
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.toUpperCase())
                      setJoinError('')
                    }}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg join-submit-btn"
                    disabled={joining || joinCode.trim().length < 6}
                  >
                    {joining ? 'Connecting…' : 'Join Session →'}
                  </button>
                </div>
                {joinError && <p className="join-form-error"><Icon name="alert" /> {joinError}</p>}
              </form>
            </div>
          </section>

          {fetchingData ? (
            <div className="student-skeleton-container">
              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="skeleton-box" style={{ height: '42px', width: '140px', borderRadius: '8px' }}></div>
                <div className="skeleton-box" style={{ height: '42px', width: '160px', borderRadius: '8px' }}></div>
                <div className="skeleton-box" style={{ height: '42px', width: '150px', borderRadius: '8px' }}></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                <div className="skeleton-box" style={{ height: '180px', borderRadius: '12px' }}></div>
                <div className="skeleton-box" style={{ height: '180px', borderRadius: '12px' }}></div>
                <div className="skeleton-box" style={{ height: '180px', borderRadius: '12px' }}></div>
              </div>
            </div>
          ) : (
            <>
              {/* Active Sessions Banner (if any live right now in enrolled courses) */}
              {activeSessions.length > 0 && (
                <section className="student-section" style={{ marginBottom: '32px' }}>
                  <div className="section-title-row">
                    <h2 className="dash-section-title">
                      <span className="live-pulse-dot">●</span> Live Now for Your Classes
                    </h2>
                    <span className="section-pill">{activeSessions.length} Active in Your Courses</span>
                  </div>

                  <div className="active-sessions-list">
                    {activeSessions.map((s) => (
                      <div key={s.id} className="active-session-banner-card">
                        <div className="active-banner-info">
                          <span className="badge badge-crimson">● LIVE NOW</span>
                          <h3 className="active-banner-title">
                            {s.title} <span className="active-banner-course">— {s.course?.course_code || 'ROOM'}</span>
                          </h3>
                        </div>
                        <button
                          className="btn btn-primary"
                          onClick={() => navigate(`/session/${s.session_code}`)}
                        >
                          Join Room #{s.session_code} →
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}



          {/* Student Tabs Navigation Row */}
          <div className="faculty-tabs-row student-tabs-row">
            <button
              className={`faculty-tab ${studentTab === 'courses' ? 'active' : ''}`}
              onClick={() => selectStudentTab('courses')}
            >
              <Icon name="folder" /> Course Vaults ({courses.length})
            </button>
            <button
              className={`faculty-tab ${studentTab === 'lectures' ? 'active' : ''}`}
              onClick={() => selectStudentTab('lectures')}
            >
              <Icon name="lecture" /> Past Lectures{loadedStudentTabs.has('lectures') ? ` (${studentPastSessions.length})` : ''}
            </button>
            <button
              className={`faculty-tab ${studentTab === 'notebook' ? 'active' : ''}`}
              onClick={() => selectStudentTab('notebook')}
            >
              <Icon name="bookmark" /> Study Notebook{loadedStudentTabs.has('notebook') ? ` (${savedBookmarks.length})` : ''}
            </button>
          </div>


          {/* ═══════════════════════════════════════════════════════════
              TAB 2: COURSE VAULTS (WITH SEARCH)
              ═══════════════════════════════════════════════════════════ */}
          {studentTab === 'courses' && (
            <div className="student-sub-section fade-in">
              <div className="section-title-row">
                <div>
                  <h2 className="dash-section-title">My Enrolled Course Vaults</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Study repositories with lecture slides, handouts, and problem sets.
                  </p>
                </div>
                <span className="section-pill">
                  {courses.length} {courses.length === 1 ? 'Enrolled Course' : 'Enrolled Courses'}
                </span>
              </div>

              {/* Course Search Toolbar */}
              <div className="sessions-toolbar" style={{ marginBottom: '24px' }}>
                <div className="sessions-search-box" style={{ flex: 1 }}>
                  <span className="search-icon"><Icon name="search" /></span>
                  <input
                    type="text"
                    className="session-search-input"
                    placeholder="Search enrolled courses by code (e.g. CS301), title, or keywords..."
                    value={studentCourseSearch}
                    onChange={e => setStudentCourseSearch(e.target.value)}
                  />
                  {studentCourseSearch && (
                    <button
                      className="clear-search-btn"
                      onClick={() => setStudentCourseSearch('')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="sessions-filters-row">
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Showing {filteredStudentCourses.length} of {courses.length}
                  </span>
                  {studentCourseSearch && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setStudentCourseSearch('')}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Courses Grid / Empty State */}
              {filteredStudentCourses.length === 0 ? (
                <div className="empty-panel card">
                  <span className="empty-panel-icon"><Icon name="folder" /></span>
                  <h3>No course vaults found</h3>
                  <p>
                    {courses.length === 0
                      ? "You haven't enrolled in any courses yet. Enter your professor's room code to join and unlock its study vault."
                      : `No courses match your search "${studentCourseSearch}".`}
                  </p>
                  {studentCourseSearch ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => setStudentCourseSearch('')}>
                      Clear Filter
                    </button>
                  ) : (
                    <div className="empty-panel-actions" style={{ display: 'flex', gap: '12px' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => document.querySelector('.join-big-input')?.focus()}>
                        Enter Room Code ↑
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="student-courses-grid">
                  <ProgressiveList items={filteredStudentCourses} key={studentCourseSearch}>{visibleItems => <>{visibleItems.map((course) => (
                    <div
                      key={course.id}
                      className="student-course-card"
                      onClick={() => navigate(`/courses/${course.id}`)}
                      style={{ cursor: 'pointer' }}
                      title="Open course study vault"
                    >
                      <div className="student-course-card-top">
                        <div className="course-card-badge">{course.course_code}</div>
                        <button
                          className="course-leave-btn"
                          onClick={(e) => handleLeaveCourse(e, course)}
                          title="Leave course repository"
                        >
                          Leave ✕
                        </button>
                      </div>
                      <h3 className="course-card-title">{course.title}</h3>
                      {course.description && <p className="course-card-desc">{course.description}</p>}
                      <div className="course-card-meta">
                        <span><Icon name="book" /> {course._count?.materials || 0} study resources</span>
                        <span><Icon name="lecture" /> {course._count?.sessions || 0} Lectures</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--brand-crimson)', fontWeight: 600 }}>Open Vault →</span>
                      </div>
                    </div>
                  ))}</>}</ProgressiveList>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 3: PAST LECTURES (WITH SEARCH & COURSE FILTER)
              ═══════════════════════════════════════════════════════════ */}
          {studentTab === 'lectures' && (
            <div className="student-sub-section fade-in">
              <div className="section-title-row">
                <div>
                  <h2 className="dash-section-title"><Icon name="lecture" /> Concluded Lectures & Recaps</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Past classroom lectures from your enrolled courses. Review answered doubts, explanations, and study notes.
                  </p>
                </div>
                <span className="section-pill">
                  {studentPastSessions.length} {studentPastSessions.length === 1 ? 'Archived Lecture' : 'Archived Lectures'}
                </span>
              </div>

              {/* Lecture Search & Filter Toolbar */}
              <div className="sessions-toolbar" style={{ marginBottom: '24px' }}>
                <div className="sessions-search-box" style={{ flex: 1 }}>
                  <span className="search-icon"><Icon name="search" /></span>
                  <input
                    type="text"
                    className="session-search-input"
                    placeholder="Search past lectures by title, topic, or room code..."
                    value={studentLectureSearch}
                    onChange={e => setStudentLectureSearch(e.target.value)}
                  />
                  {studentLectureSearch && (
                    <button
                      className="clear-search-btn"
                      onClick={() => setStudentLectureSearch('')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="sessions-filters-row">
                  <select
                    className="filter-select"
                    value={studentLectureCourseFilter}
                    onChange={e => setStudentLectureCourseFilter(e.target.value)}
                  >
                    <option value="all">All Enrolled Courses</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.course_code} - {c.title}</option>
                    ))}
                  </select>

                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Showing {filteredStudentLectures.length} of {studentPastSessions.length}
                  </span>

                  {(studentLectureSearch || studentLectureCourseFilter !== 'all') && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setStudentLectureSearch('')
                        setStudentLectureCourseFilter('all')
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Lectures List / Empty State */}
              {filteredStudentLectures.length === 0 ? (
                <div className="empty-panel card">
                  <span className="empty-panel-icon"><Icon name="lecture" /></span>
                  <h3>No concluded lectures found</h3>
                  <p>
                    {studentPastSessions.length === 0
                      ? 'When live lectures in your enrolled courses finish, their question archives and study notes will automatically appear here.'
                      : 'No archived lectures match your current search or course filter.'}
                  </p>
                  {(studentLectureSearch || studentLectureCourseFilter !== 'all') && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setStudentLectureSearch('')
                        setStudentLectureCourseFilter('all')
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="student-courses-grid">
                  <ProgressiveList items={filteredStudentLectures} key={studentLectureSearch + studentLectureCourseFilter}>{visibleItems => <>{visibleItems.map((s) => (
                    <div key={s.id} className="student-course-card" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="student-course-card-top">
                        <div className="course-card-badge">{s.course?.course_code || 'ROOM'}</div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          #{s.session_code}
                        </span>
                      </div>

                      <h3 className="course-card-title">{s.title}</h3>
                      {s.course?.title && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          {s.course.title} {s.teacher?.name ? `· Prof. ${s.teacher.name}` : ''}
                        </p>
                      )}
                      {s.subject && <p className="course-card-desc" style={{ marginBottom: '12px' }}>{s.subject}</p>}

                      <div style={{ marginTop: 'auto' }}>
                        <div className="course-card-meta" style={{ marginBottom: '14px' }}>
                          <span><Icon name="message" /> {s._count?.questions || 0} Questions Asked</span>
                          <span>{new Date(s.started_at).toLocaleDateString()}</span>
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => navigate(`/session/${s.session_code}/recap`)}
                        >
                          View Lecture Recap & Q&A →
                        </button>
                      </div>
                    </div>
                  ))}</>}</ProgressiveList>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB 4: STUDY NOTEBOOK (SAVED DOUBTS WITH SEARCH & FILTER)
              ═══════════════════════════════════════════════════════════ */}
          {studentTab === 'notebook' && (
            <div className="student-sub-section fade-in">
              <div className="section-title-row">
                <div>
                  <h2 className="dash-section-title"><Icon name="bookmark" /> Study Notebook & Starred Doubts</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Questions, code snippets, and professor explanations you've starred across lectures.
                  </p>
                </div>
                <span className="section-pill">
                  {savedBookmarks.length} {savedBookmarks.length === 1 ? 'Saved Doubt' : 'Saved Doubts'}
                </span>
              </div>

              {/* Notebook Search & Filter Toolbar */}
              <div className="sessions-toolbar" style={{ marginBottom: '24px' }}>
                <div className="sessions-search-box" style={{ flex: 1 }}>
                  <span className="search-icon"><Icon name="search" /></span>
                  <input
                    type="text"
                    className="session-search-input"
                    placeholder="Search starred questions, professor answers, or code..."
                    value={studentNotebookSearch}
                    onChange={e => setStudentNotebookSearch(e.target.value)}
                  />
                  {studentNotebookSearch && (
                    <button
                      className="clear-search-btn"
                      onClick={() => setStudentNotebookSearch('')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="sessions-filters-row">
                  <select
                    className="filter-select"
                    value={studentNotebookCourseFilter}
                    onChange={e => setStudentNotebookCourseFilter(e.target.value)}
                  >
                    <option value="all">All Enrolled Courses</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.course_code} - {c.title}</option>
                    ))}
                  </select>

                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Showing {filteredSavedBookmarks.length} of {savedBookmarks.length}
                  </span>

                  {(studentNotebookSearch || studentNotebookCourseFilter !== 'all') && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setStudentNotebookSearch('')
                        setStudentNotebookCourseFilter('all')
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Starred Doubts Cards / Empty State */}
              {filteredSavedBookmarks.length === 0 ? (
                <div className="empty-panel card">
                  <span className="empty-panel-icon"><Icon name="bookmark" /></span>
                  <h3>No saved doubts found</h3>
                  <p>
                    {savedBookmarks.length === 0
                      ? "Your notebook is empty. Click the star icon () on any question in a live lecture or recap to save it here for exam revision."
                      : "No starred doubts match your search query or course filter."}
                  </p>
                  {(studentNotebookSearch || studentNotebookCourseFilter !== 'all') && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setStudentNotebookSearch('')
                        setStudentNotebookCourseFilter('all')
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="saved-doubts-grid" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <ProgressiveList items={filteredSavedBookmarks} key={studentNotebookSearch + studentNotebookCourseFilter}>{visibleItems => <>{visibleItems.map((b) => {
                    const q = b.question
                    const sess = q?.session
                    const course = sess?.course
                    return (
                      <div key={b.id} className="saved-doubt-card card" style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span className="badge badge-ghost" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                              {course?.course_code || 'ROOM'}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              #{sess?.session_code} · {sess?.title}
                            </span>
                          </div>
                          <BusyButton busy={pendingActions.has(`bookmark:${q.id}`)}
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleRemoveBookmark(q.id)}
                            title="Remove bookmark"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            ✕ Remove
                          </BusyButton>
                        </div>

                        <p style={{ fontSize: '1.05rem', fontWeight: 500, margin: '8px 0', color: 'var(--text-primary)' }}>
                          {q.question_text}
                        </p>

                        {q.code_snippet && (
                          <div style={{ margin: '8px 0', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 14px' }}>
                            <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                              <code>{q.code_snippet}</code>
                            </pre>
                          </div>
                        )}

                        {q.answer_text && (
                          <div style={{
                            marginTop: '12px',
                            padding: '12px 16px',
                            background: 'rgba(34, 197, 94, 0.08)',
                            borderLeft: '3px solid #22C55E',
                            borderRadius: '0 6px 6px 0'
                          }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              <Icon name="user" /> Professor's Answer
                            </span>
                            <p style={{ margin: '4px 0 0', fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                              {q.answer_text}
                            </p>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            ▲ {q.upvotes} upvotes · Saved {new Date(b.created_at).toLocaleDateString()}
                          </span>
                          {sess?.session_code && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => navigate(`/session/${sess.session_code}/recap`)}
                            >
                              View Lecture Recap →
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}</>}</ProgressiveList>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  ) : (
        /* ═══════════════════════════════════════════════════════════════
            FACULTY COMMAND CENTER (OBSIDIAN STUDIO THEME)
            ═══════════════════════════════════════════════════════════════ */
        <main className="faculty-dashboard fade-up">
          {/* Faculty Header */}
          <section className="faculty-header">
            <div>
              <div className="faculty-eyebrow">FACULTY COMMAND CENTER</div>
              <h1 className="faculty-greeting">
                {timeGreeting}, <em>{displayName ? `${displayName}.` : 'Professor.'}</em>
              </h1>
            </div>
            <div className="faculty-header-actions">
              <button className="btn btn-primary btn-lg" onClick={() => setShowCreate(true)}>
                + Start Instant Lecture
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => setShowCreateCourse(true)}>
                + New Course
              </button>
            </div>
          </section>

          {/* Navigation Tabs */}
          <div className="faculty-tabs-row">
            <button
              className={`faculty-tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              Home
            </button>
            <button
              className={`faculty-tab ${activeTab === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              Sessions ({sessions.length})
            </button>
            <button
              className={`faculty-tab ${activeTab === 'doubts' ? 'active' : ''}`}
              onClick={() => setActiveTab('doubts')}
            >
              Doubts
              {unresolvedDoubts.length > 0 && (
                <span className="tab-count-badge">{unresolvedDoubts.length}</span>
              )}
            </button>
            <button
              className={`faculty-tab ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => setActiveTab('courses')}
            >
              Courses ({courses.length})
            </button>
          </div>

          {/*  TAB: HOME  */}
          {fetchingData && <PageSkeleton label="Loading lectures and courses..." />}
          {!fetchingData && activeTab === 'home' && (
            <FacultyHomeTab
              pendingActions={pendingActions}
              activeRooms={activeRooms}
              setShowCreate={setShowCreate}
              copyRoomLink={copyRoomLink}
              getElapsedTime={getElapsedTime}
              navigate={navigate}
              handleEndSession={handleEndSession}
              triggerDeleteSession={triggerDeleteSession}
              endedSessions={endedSessions}
              setActiveTab={setActiveTab}
            />
          )}

          {/*  TAB: SESSIONS  */}
          {!fetchingData && activeTab === 'sessions' && (
            <FacultySessionsTab
              filteredSessions={filteredSessions}
              sessions={sessions}
              sessionEditMode={sessionEditMode}
              setSessionEditMode={setSessionEditMode}
              setSelectedSessions={setSelectedSessions}
              sessionSearch={sessionSearch}
              setSessionSearch={setSessionSearch}
              sessionCourseFilter={sessionCourseFilter}
              setSessionCourseFilter={setSessionCourseFilter}
              courses={courses}
              sessionStatusFilter={sessionStatusFilter}
              setSessionStatusFilter={setSessionStatusFilter}
              sessionSort={sessionSort}
              setSessionSort={setSessionSort}
              selectedSessions={selectedSessions}
              selectAllFiltered={selectAllFiltered}
              setShowBatchDeleteModal={setShowBatchDeleteModal}
              toggleSelectSession={toggleSelectSession}
              copyRoomLink={copyRoomLink}
              setTaggingSession={setTaggingSession}
              navigate={navigate}
              triggerDeleteSession={triggerDeleteSession}
            />
          )}

          {/*  TAB: DOUBTS  */}
          {!fetchingData && activeTab === 'doubts' && (
            <FacultyDoubtsTab
              pendingActions={pendingActions}
              unresolvedDoubts={unresolvedDoubts}
              doubtsCourseFilter={doubtsCourseFilter}
              setDoubtsCourseFilter={setDoubtsCourseFilter}
              courses={courses}
              doubtsSessionFilter={doubtsSessionFilter}
              setDoubtsSessionFilter={setDoubtsSessionFilter}
              sessions={sessions}
              filteredDoubts={filteredDoubts}
              stripInstructorPrefix={stripInstructorPrefix}
              handleMarkAnswered={handleMarkAnswered}
              navigate={navigate}
            />
          )}

          {/*  TAB: COURSES  */}
          {!fetchingData && activeTab === 'courses' && (
            <FacultyCoursesTab
              setShowCreateCourse={setShowCreateCourse}
              courseSearch={courseSearch}
              setCourseSearch={setCourseSearch}
              filteredTeacherCourses={filteredTeacherCourses}
              courses={courses}
              navigate={navigate}
              setUploadingForCourse={setUploadingForCourse}
              uploadingForCourse={uploadingForCourse}
              uploadTitle={uploadTitle}
              setUploadTitle={setUploadTitle}
              uploadCategory={uploadCategory}
              setUploadCategory={setUploadCategory}
              setUploadFile={setUploadFile}
              handleUploadCourseMaterial={handleUploadCourseMaterial}
              isUploading={isUploading}
            />
          )}
        </main>
      )}

      <DashboardModals
              pendingActions={pendingActions}
        showCreate={showCreate}
        setShowCreate={setShowCreate}
        form={form}
        setForm={setForm}
        courses={courses}
        createSession={createSession}
        creating={creating}
        showCreateCourse={showCreateCourse}
        setShowCreateCourse={setShowCreateCourse}
        courseForm={courseForm}
        setCourseForm={setCourseForm}
        createCourse={createCourse}
        creatingCourse={creatingCourse}
        sessionToDelete={sessionToDelete}
        setSessionToDelete={setSessionToDelete}
        deleting={deleting}
        confirmDeleteSession={confirmDeleteSession}
        showBatchDeleteModal={showBatchDeleteModal}
        setShowBatchDeleteModal={setShowBatchDeleteModal}
        selectedSessions={selectedSessions}
        isBatchDeleting={isBatchDeleting}
        handleBatchDelete={handleBatchDelete}
        taggingSession={taggingSession}
        setTaggingSession={setTaggingSession}
        handleAssignCourse={handleAssignCourse}
        courseToLeave={courseToLeave}
        setCourseToLeave={setCourseToLeave}
        confirmLeaveCourse={confirmLeaveCourse}
      />

      {/* Toast notifications */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span>{toast.type === 'error' ? "" : '✓'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
