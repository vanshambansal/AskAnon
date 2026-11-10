import { PageSkeleton } from '../components/common/AsyncFeedback'
import { startActivity } from '../utils/networkActivity'
import usePendingActions from '../hooks/usePendingActions'
import { BusyButton } from '../components/common/AsyncFeedback'
import Icon from '../components/common/Icon'
import { useState, useEffect, useEffectEvent, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser, useAuth } from '@clerk/clerk-react'
import axios from 'axios'
import { io } from 'socket.io-client'
import { exportSessionPDF } from '../utils/lazyExportPDF'

import SessionHeader from '../components/session/SessionHeader'
import PinnedQuestionBanner from '../components/session/PinnedQuestionBanner'
import QuestionCard from '../components/session/QuestionCard'
import QuestionInput from '../components/session/QuestionInput'
import MediaStrip from '../components/session/MediaStrip'
import LightboxModal from '../components/session/LightboxModal'
import MaterialsDrawer from '../components/session/MaterialsDrawer'
import LivePollBanner from '../components/session/LivePollBanner'
import TeacherBroadcastModal from '../components/session/TeacherBroadcastModal'
import CreatePollModal from '../components/session/CreatePollModal'
import DuplicatePromptModal from '../components/session/DuplicatePromptModal'

import './SessionRoom.css'

const API = import.meta.env.VITE_API_URL

export default function SessionRoom() {
  const { code: routeCode } = useParams()
  const code = routeCode.toUpperCase()
  const [searchParams] = useSearchParams()
  const { user } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { pending: pendingActions, run: runAction } = usePendingActions()

  const [session, setSession] = useState(null)
  const [questions, setQuestions] = useState([])
  const [sessionMedia, setSessionMedia] = useState([])
  const [materials, setMaterials] = useState([])
  const [showMaterialsDrawer, setShowMaterialsDrawer] = useState(false)
  const [uploadingMaterial, setUploadingMaterial] = useState(false)
  const [questionText, setQuestionText] = useState('')
  const [dbUser, setDbUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('db_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  // ── ROOM OWNERSHIP & INSTRUCTOR CHECK ──
  // A user is strictly an instructor if they created this lecture hall (session.teacher_id === dbUser.id).
  // If ?role=student is explicitly set, honor previewing as a student.
  const isCreator = Boolean(session && dbUser && session.teacher_id === dbUser.id)
  const isTeacher = isCreator && dbUser?.role === 'teacher' && searchParams.get('role') !== 'student'

  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [votedIds, setVotedIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [filterTab, setFilterTab] = useState('trending') // 'trending' | 'newest' | 'unanswered'
  const [isPaused, setIsPaused] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  // Image upload and inspection state
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [sharingMedia, setSharingMedia] = useState(false)
  const [expandedImage, setExpandedImage] = useState(null)

  // In-Class Code Snippet State (Student Composer)
  const [codeSnippet, setCodeSnippet] = useState('')
  const [codeLanguage, setCodeLanguage] = useState('python')
  const [showCodeInput, setShowCodeInput] = useState(false)

  // Faculty Broadcast Modal State (Text Answer or Code)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcasting, setBroadcasting] = useState(false)

  // Live Classroom Poll State
  const [activePoll, setActivePoll] = useState(null)
  const [myPollVote, setMyPollVote] = useState(null)
  const [showCreatePollModal, setShowCreatePollModal] = useState(false)

  // Student Bookmarks State
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  const bookmarkRequests = useRef(new Set())
  const [savingBookmarkIds, setSavingBookmarkIds] = useState(new Set())

  // Semantic Duplicate Detection State
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [duplicateMatch, setDuplicateMatch] = useState(null)
  const [duplicatePendingText, setDuplicatePendingText] = useState('')

  // In-App Confirmation Modals
  const [materialToDelete, setMaterialToDelete] = useState(null)
  const [showEndSessionModal, setShowEndSessionModal] = useState(false)

  const socketRef = useRef(null)
  const initGeneration = useRef(0)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const postingRef = useRef(false)
  const fileInputRef = useRef(null)
  const shareInputRef = useRef(null)

  // ── INIT ────────────────────────────────────────────────
  const initialize = useEffectEvent(generation => init(generation))
  useEffect(() => {
    const generation = ++initGeneration.current
    if (user) initialize(generation)
    return () => {
      initGeneration.current = generation + 1
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [user, code])

  // ── COOLDOWN TIMER ──────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const sortQ = (qs) =>
    [...qs].sort((a, b) => b.upvotes - a.upvotes || new Date(a.created_at) - new Date(b.created_at))

  const init = async (generation) => {
    const current = () => generation === initGeneration.current
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      // ── FAST-PATH AUTH: Use cached db_user immediately if valid ──
      let currentDbUser = null
      try {
        const cached = sessionStorage.getItem('db_user')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed.clerk_user_id === user.id) {
            currentDbUser = parsed
            setDbUser(parsed)
          }
        }
      } catch { /* No cached value is available; use the normal loading path. */ }

      const syncPayload = {
        clerk_user_id: user.id,
        email: user.emailAddresses[0].emailAddress,
        name: user.fullName || user.firstName
      }
      const syncPromise = axios.post(`${API}/api/users/sync`, syncPayload, { headers })
        .then((res) => {
          if (!current()) return res.data
          setDbUser(res.data)
          sessionStorage.setItem('db_user', JSON.stringify(res.data))
          return res.data
        })
        .catch((err) => {
          console.warn('Background user sync warning:', err.message)
          return currentDbUser
        })

      if (!currentDbUser) {
        currentDbUser = await syncPromise
      }

      // ── COMPOSITE BFF BUNDLE: Single network roundtrip for all classroom state ──
      const bundleRes = await axios.get(
        `${API}/api/sessions/${code}/bundle?user_id=${currentDbUser?.id || ''}`,
        { headers }
      )

      if (!current()) return
      const {
        session: currentSession,
        questions: initialQuestions,
        media: initialMedia,
        materials: initialMaterials,
        bookmarkedIds: initialBookmarks
      } = bundleRes.data

      if (!currentSession.is_active) {
        navigate(`/session/${code}/recap`, { replace: true })
        return
      }

      setSession(currentSession)
      setIsPaused(Boolean(currentSession.is_paused))
      setVotedIds(new Set(bundleRes.data.votedIds || []))
      setActivePoll(bundleRes.data.poll || null)
      setMyPollVote(bundleRes.data.poll?.myVote ?? null)
      setQuestions(initialQuestions || [])
      setSessionMedia(initialMedia || [])
      setMaterials(initialMaterials || [])
      setBookmarkedIds(new Set(initialBookmarks || []))

      // ── STAGE 3: Socket.IO Connection & Event Handlers ──
      const socket = io(API, { autoConnect: false, transports: ['websocket'], auth: async callback => {
        try { callback({ token: await getToken() }) } catch { callback({ token: null }) }
      } })
      socketRef.current = socket
      let roomRevision = 0
      socket.onAny(() => { roomRevision++ })
      const syncBundle = async () => {
        if (!current()) return
        const revision = roomRevision
        try {
          const fresh = await axios.get(`${API}/api/sessions/${code}/bundle`, { headers: { Authorization: `Bearer ${await getToken()}` } })
          if (!current()) return
          if (revision !== roomRevision) { setTimeout(syncBundle, 100); return }
          if (!fresh.data.session.is_active) { navigate(`/session/${code}/recap`, { replace: true }); return }
          setSession(fresh.data.session)
          setQuestions(sortQ(fresh.data.questions || []))
          setSessionMedia(fresh.data.media || [])
          setMaterials(fresh.data.materials || [])
          setBookmarkedIds(new Set(fresh.data.bookmarkedIds || []))
          setVotedIds(new Set(fresh.data.votedIds || []))
          setIsPaused(Boolean(fresh.data.session.is_paused))
          setActivePoll(fresh.data.poll || null)
          setMyPollVote(fresh.data.poll?.myVote ?? null)
          socket.emit('refresh-workspace')
        } catch (err) {
          if (current() && err.response?.status === 404) navigate('/dashboard', { replace: true })
        }
      }
      socket.on('connect', () => {
        setConnectionStatus('connected')
        socket.emit('join-session', code, reply => { if (reply?.ok) syncBundle() })
      })
      socket.on('disconnect', () => { if (current()) setConnectionStatus('offline') })
      socket.on('connect_error', () => { if (current()) setConnectionStatus('offline') })
      socket.on('session-state', state => {
        if (state.sessionCode !== code) return
        setIsPaused(Boolean(state.isPaused))
        setActivePoll(state.poll || null)
        setMyPollVote(state.poll?.myVote ?? null)
      })
      socket.on('operation-error', ({ message }) => showToast(message, 'error'))
      socket.on('session-updated', syncBundle)
      socket.on('workspace-updated', event => { if (event.sessionId === currentSession.id || event.courseId === currentSession.course_id) syncBundle() })

      socket.on('question-received', (q) => {
        setQuestions((prev) => {
          if (prev.find((x) => x.id === q.id)) return prev
          return sortQ([...prev, q])
        })
      })

      socket.on('question-updated', (q) => {
        setQuestions((prev) => sortQ([...prev.filter(x => x.id !== q.id), q]))
      })

      socket.on('question-pinned', (pinnedQ) => {
        setQuestions((prev) =>
          sortQ(
            [...prev.filter(x => x.id !== pinnedQ.id), pinnedQ].map((x) => {
              if (x.id === pinnedQ.id) return pinnedQ
              if (x.status === 'PINNED') return { ...x, status: 'PENDING', pinned_at: null }
              return x
            })
          )
        )
      })

      socket.on('question-unpinned', (unpinnedId) => {
        setQuestions((prev) =>
          sortQ(
            prev.map((x) => (x.id === unpinnedId ? { ...x, status: 'PENDING', pinned_at: null } : x))
          )
        )
      })

      socket.on('question-removed', (id) => {
        setQuestions((prev) => prev.filter((x) => x.id !== id))
      })

      socket.on('media-received', (media) => {
        setSessionMedia((prev) => {
          if (!media) return prev
          const exists = prev.some(
            (m) => (media.id && m.id === media.id) || (media.public_id && m.public_id === media.public_id)
          )
          if (exists) return prev
          return [...prev, media]
        })
        showToast('📎 Whiteboard diagram shared with class!')
      })

      socket.on('media-removed', (publicId) => {
        setSessionMedia((prev) => prev.filter((x) => x.public_id !== publicId))
      })

      socket.on('material-received', (material) => {
        setMaterials((prev) => {
          if (prev.find((x) => x.id === material.id)) return prev
          return [...prev, material]
        })
        showToast(`New material shared: ${material.title}`)
      })

      socket.on('material-removed', (materialId) => {
        setMaterials((prev) => prev.filter((x) => x.id !== materialId))
      })

      socket.on('session-paused', () => {
        setIsPaused(true)
        showToast('Professor has paused question intake')
      })

      socket.on('session-resumed', () => {
        setIsPaused(false)
        showToast('Question intake resumed by professor!')
      })

      socket.on('session-ended', (data) => {
        if (data?.sessionCode !== code) return
        showToast(data?.message || 'The lecture has ended. Generating recap...')
        navigate(`/session/${code}/recap`, { replace: true })
      })

      socket.on('session-closed', (data) => {
        if (data?.sessionCode && data.sessionCode !== code) return
        showToast(data?.message || 'This lecture room was deleted by the instructor.', 'error')
        navigate('/dashboard', { replace: true })
      })

      // Live Poll Socket Events
      socket.on('poll-started', (poll) => {
        setActivePoll(poll)
        setMyPollVote(poll.myVote ?? null)
        showToast('📊 New live classroom poll started!')
      })

      socket.on('poll-updated', (updatedPoll) => {
        setActivePoll(updatedPoll)
      })

      socket.on('poll-ended', (concludedPoll) => {
        setActivePoll(concludedPoll || ((prev) => (prev ? { ...prev, active: false } : null)))
        showToast('Live voting concluded')
      })

      socket.on('poll-removed', () => {
        setActivePoll(null)
        setMyPollVote(null)
      })


      // Asynchronous AI flag notification
      socket.on('question-flagged', ({ questionId, reason }) => {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId ? { ...q, status: 'FLAGGED', flag_reason: reason } : q
          )
        )
      })

      if (current()) socket.connect()
    } catch (err) {
      if (current()) { console.error('Init error:', err); navigate('/dashboard') }
    } finally {
      if (current()) setLoading(false)
    }
  }

  // ── STUDENT: IMAGE SELECT FOR QUESTION ──────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── STUDENT: POST QUESTION ──────────────────────────────
  const postQuestion = async (bypassDuplicate = false, linkedMatch = null) => {
    if (isPaused) {
      setError('Professor has temporarily paused question submissions.')
      return
    }
    const text = questionText.trim()
    const hasContent = text.length > 0 || codeSnippet.trim().length > 0 || Boolean(selectedImage)
    if (!hasContent || postingRef.current) return

    // ── ON-SUBMIT SEMANTIC DUPLICATE PRE-CHECK ──
    if (!bypassDuplicate && text.length >= 3 && !selectedImage && !codeSnippet.trim()) {
      setCheckingDuplicate(true)
      try {
        const token = await getToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const checkRes = await axios.post(
          `${API}/api/questions/check-duplicate`,
          { session_id: session.id, question_text: text },
          { headers }
        )
        if (checkRes.data?.hasDuplicate && checkRes.data.matchedQuestion) {
          setDuplicateMatch(checkRes.data.matchedQuestion)
          setDuplicatePendingText(text)
          setCheckingDuplicate(false)
          return // Intercept submission to show similar doubt dialog
        }
      } catch (checkErr) {
        console.warn('Duplicate pre-check failed open:', checkErr.message)
      } finally {
        setCheckingDuplicate(false)
      }
    }

    postingRef.current = true
    setPosting(true)
    setError('')
    setQuestionText('')
    setDuplicateMatch(null)
    setDuplicatePendingText('')

    try {
      const token = await getToken()
      let image_url = null
      let image_receipt = null

      // Upload image first if attached
      if (selectedImage) {
        setUploadingImage(true)
        const formData = new FormData()
        formData.append('image', selectedImage)
        const uploadRes = await axios.post(`${API}/api/upload/question`, formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${await getToken()}` }
        })
        image_url = uploadRes.data.image_url
        image_receipt = uploadRes.data.image_receipt
        setUploadingImage(false)
        removeSelectedImage()
      }

      const res = await axios.post(
        `${API}/api/questions`,
        {
          session_id: session.id,
          question_text: text,
          user_id: dbUser.id,
          image_url,
          image_receipt,
          code_snippet: codeSnippet.trim() || null,
          code_language: codeSnippet.trim() ? codeLanguage : null,
          related_to_id: linkedMatch?.id || null,
          related_text: linkedMatch?.question_text || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      setQuestions(prev => sortQ([...prev.filter(q => q.id !== res.data.id), res.data]))
      setCodeSnippet('')
      setShowCodeInput(false)
      setQuestionText('')
      setError('')
      setCooldown(30) // Anti-spam 30s timer runs in bottom toolbar
      showToast(res.data.status === 'FLAGGED' ? 'Sent to your instructor for review. This question is not in the class feed.' : 'Question posted!')
    } catch (err) {
      if (err.response?.status === 429) {
        const secs = parseInt(err.response.data.error.match(/\d+/)?.[0]) || 30
        setCooldown(secs)
        setError('') // No redundant banner; bottom toolbar cleanly displays countdown
        setQuestionText(text)
      } else if (err.response?.data?.error) {
        if (err.response.data.penalty_seconds) {
          setCooldown(err.response.data.penalty_seconds) // 2-minute penalty timeout
        }
        setError(err.response.data.error)
        setQuestionText(text)
      } else {
        setError('Failed to post. Try again.')
        setQuestionText(text)
      }
      setUploadingImage(false)
    } finally {
      setPosting(false)
      postingRef.current = false
    }
  }

  // ── DUPLICATE MODAL ACTIONS ──────────────────────────────
  const handleUpvoteExisting = async (matchedId) => {
    return runAction('duplicate', async () => {
      const q = questions.find((x) => x.id === matchedId)
      if (!q) { showToast('This question is no longer available. Your draft is preserved.', 'error'); return }
      if (await upvote(q)) {
        setDuplicateMatch(null)
        setDuplicatePendingText('')
        setQuestionText('')
        showToast('Existing question upvoted.')
      }
    })
  }

  const handlePostAnyway = () => {
    const textToPost = duplicatePendingText || questionText
    const matchToLink = duplicateMatch
    setDuplicateMatch(null)
    setDuplicatePendingText('')
    setQuestionText(textToPost)
    // Re-call post with bypassDuplicate = true and the linked match
    setTimeout(() => {
      postQuestion(true, matchToLink)
    }, 10)
  }

  // ── TEACHER: SHARE MEDIA ────────────────────────────────
  const handleShareMedia = async (e) => {
    const file = e.target.files[0]
    if (!file || !session) return
    setSharingMedia(true)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await axios.post(`${API}/api/upload/session/${session.id}/media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${await getToken()}` }
      })

      setSessionMedia(prev => [...prev.filter(m => m.id !== res.data.id), res.data])
      showToast('Image shared with everyone!')
    } catch (err) {
      console.error('Share media error:', err)
      showToast('Failed to share image', 'error')
    } finally {
      setSharingMedia(false)
      if (shareInputRef.current) shareInputRef.current.value = ''
    }
  }

  // ── TEACHER: DELETE MEDIA ───────────────────────────────
  const deleteMedia = async (media) => {
    return runAction(`delete-media:${media.id}`, async () => {
      try {
        const encodedId = encodeURIComponent(media.public_id)
        await axios.delete(`${API}/api/upload/media/${encodedId}`, { headers: { Authorization: `Bearer ${await getToken()}` } })
        showToast('Image removed')
      } catch (err) {
        console.error('Delete media error:', err)
        showToast('Failed to remove image', 'error')
      }

    })
  }

  // ── TEACHER: SAVE SHARED MEDIA TO COURSE VAULT ──────────
  const handleSaveMediaToVault = async (media) => {
    return runAction(`save-media:${media.id}`, async () => {
      if (!session || !media) return
      try {
        const token = await getToken()
        const res = await axios.post(
          `${API}/api/materials/from-media`,
          {
            session_id: session.id,
            media_id: media.id || media.public_id,
            title: media.caption || `Diagram (${session.title})`
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )

        setMaterials((prev) => {
          if (prev.find((x) => x.id === res.data.id)) return prev
          return [...prev, res.data]
        })
        showToast('📁 Diagram saved to Course Study Vault!')
      } catch (err) {
        console.error('Save to vault error:', err)
        showToast('Failed to save to Course Vault', 'error')
      }

    })
  }

  // ── TEACHER: UPLOAD STUDY MATERIAL (PDF / SLIDES) ───────
  const handleUploadMaterial = async ({ file, title, category }) => {
    return runAction('upload-material', async () => {
      if (!file || !title.trim() || !session) return
      setUploadingMaterial(true)

      try {
        const token = await getToken()
        const formData = new FormData()
        formData.append('title', title)
        formData.append('category', category)
        formData.append('session_id', session.id)
        if (session.course_id) formData.append('course_id', session.course_id)
        formData.append('file', file)

        const res = await axios.post(`${API}/api/materials/upload`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        })

        setMaterials((prev) => [...prev.filter(material => material.id !== res.data.id), res.data])
        showToast('Material uploaded & shared with class!')
        return true
      } catch (err) {
        console.error('Upload material error:', err)
        showToast(err.response?.data?.error || 'Failed to upload material', 'error')
        return false
      } finally {
        setUploadingMaterial(false)
      }
    })
  }

  // ── TEACHER: DELETE STUDY MATERIAL ──────────────────────
  const handleDeleteMaterial = (material) => {
    setMaterialToDelete(material)
  }

  const confirmDeleteMaterial = async () => {
    return runAction('delete-material', async () => {
      if (!materialToDelete) return
      const material = materialToDelete
      try {
        const token = await getToken()
        await axios.delete(`${API}/api/materials/${material.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        setMaterials((prev) => prev.filter((x) => x.id !== material.id))
        setMaterialToDelete(null)
        showToast('Material removed')
      } catch (err) {
        console.error('Delete material error:', err)
        showToast('Failed to delete material', 'error')
      }

    })
  }

  // ── UPVOTE (OPTIMISTIC UI: 0MS LOCAL UPDATE) ─────────────
  const upvote = async q => {
    if (isTeacher) return false
    if (votedIds.has(q.id)) return true
    setVotedIds(prev => new Set([...prev, q.id]))
    setQuestions(prev => sortQ(prev.map(item => item.id === q.id ? { ...item, upvotes: item.upvotes + 1 } : item)))
    try {
      const token = await getToken()
      const res = await axios.post(`${API}/api/questions/${q.id}/upvote`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setQuestions(prev => sortQ(prev.map(item => item.id === q.id ? res.data : item)))
      return true
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to save your vote. Please retry.', 'error')
      try {
        const fresh = await axios.get(`${API}/api/sessions/${code}/bundle`, { headers: { Authorization: `Bearer ${await getToken()}` } })
        setQuestions(sortQ(fresh.data.questions))
        setVotedIds(new Set(fresh.data.votedIds || []))
      } catch {
        setVotedIds(prev => { const ids = new Set(prev); ids.delete(q.id); return ids })
        setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, upvotes: q.upvotes } : item))
      }
      return err.response?.status === 409
    }
  }

  const statusRequests = useRef(new Set())
  const [savingQuestionIds, setSavingQuestionIds] = useState(new Set())
  const [savingQuestionActions, setSavingQuestionActions] = useState({})
  const changeQuestionStatus = async (q, nextStatus) => {
    // Only one pin transition at a time: the room has one shared spotlight.
    const key = nextStatus === 'PINNED' || q.status === 'PINNED' ? 'spotlight' : q.id
    if (statusRequests.current.has(key) || statusRequests.current.has(q.id)) return
    statusRequests.current.add(key)
    statusRequests.current.add(q.id)
    setSavingQuestionIds(new Set(statusRequests.current))
    setSavingQuestionActions(prev => ({ ...prev, [q.id]: nextStatus }))
    const affected = questions.filter(x => x.id === q.id || (nextStatus === 'PINNED' && x.status === 'PINNED'))
    setQuestions(prev => sortQ(prev.map(x => x.id === q.id
      ? { ...x, status: nextStatus, pinned_at: nextStatus === 'PINNED' ? new Date().toISOString() : null, is_answered: nextStatus === 'ANSWERED' }
      : nextStatus === 'PINNED' && x.status === 'PINNED' ? { ...x, status: 'PENDING', pinned_at: null } : x)))
    try {
      const token = await getToken()
      const res = await axios.patch(`${API}/api/questions/${q.id}/status`, { status: nextStatus }, { headers: { Authorization: `Bearer ${token}` } })
      setQuestions(prev => sortQ(prev.map(x => x.id === q.id ? res.data : x)))
      showToast(nextStatus === 'ANSWERED' ? 'Marked as answered' : nextStatus === 'PINNED' ? 'Question spotlighted for class' : nextStatus === 'DISMISSED' ? 'Question dismissed' : q.status === 'FLAGGED' ? 'Question restored to the class feed' : 'Question unpinned')
    } catch (err) {
      setQuestions(prev => sortQ(prev.map(x => affected.find(old => old.id === x.id) || x)))
      showToast(err.response?.data?.error || 'Could not save the change. The previous state was restored.', 'error')
      // Recover authoritative state if a response was lost after the server committed.
      try {
        const token = await getToken()
        const fresh = await axios.get(`${API}/api/sessions/${code}/bundle`, { headers: { Authorization: `Bearer ${token}` } })
        setQuestions(sortQ(fresh.data.questions || []))
      } catch { /* Keep the visible rollback until reconnection refreshes the room. */ }
    } finally {
      setSavingQuestionActions(prev => { const next = { ...prev }; delete next[q.id]; return next })
      statusRequests.current.delete(key)
      statusRequests.current.delete(q.id)
      setSavingQuestionIds(new Set(statusRequests.current))
    }
  }
  const togglePinQuestion = q => changeQuestionStatus(q, q.status === 'PINNED' ? 'PENDING' : 'PINNED')
  const markAnswered = q => changeQuestionStatus(q, 'ANSWERED')

  // ── TEACHER: SUBMIT WRITTEN EXPLANATION ──────────────────
  const handleSubmitAnswerText = async (questionId, text) => {
    try {
      const token = await getToken()
      const res = await axios.patch(
        `${API}/api/questions/${questionId}/answer-text`,
        { answer_text: text, user_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setQuestions((prev) => sortQ(prev.map((q) => (q.id === questionId ? res.data : q))))
      showToast('Answer published to class!')
    } catch (err) {
      console.error('Submit answer text error:', err)
      showToast(err.response?.data?.error || 'Failed to publish answer', 'error')
      throw err
    }
  }

  // ── STUDENT: TOGGLE BOOKMARK QUESTION ────────────────────
  const handleToggleBookmark = async (questionId) => {
    if (!dbUser || bookmarkRequests.current.has(questionId)) return
    bookmarkRequests.current.add(questionId)
    setSavingBookmarkIds(new Set(bookmarkRequests.current))
    const isCurrently = bookmarkedIds.has(questionId)
    setBookmarkedIds((prev) => {
      const next = new Set(prev)
      if (isCurrently) next.delete(questionId)
      else next.add(questionId)
      return next
    })

    try {
      const token = await getToken()
      await axios.post(
        `${API}/api/bookmarks/${questionId}/toggle`,
        { user_id: dbUser.id },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      showToast(isCurrently ? 'Removed from saved doubts' : 'Doubt saved to notebook')
    } catch (err) {
      console.error('Toggle bookmark error:', err)
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (isCurrently) next.add(questionId)
        else next.delete(questionId)
        return next
      })
      showToast('Failed to update bookmark', 'error')
    } finally {
      bookmarkRequests.current.delete(questionId)
      setSavingBookmarkIds(new Set(bookmarkRequests.current))
    }
  }

  // ── TEACHER: DELETE QUESTION ─────────────────────────────
  const deleteQuestion = async (q) => {
    return runAction(`delete-question:${q.id}`, async () => {
      try {
        const token = await getToken()
        await axios.delete(`${API}/api/questions/${q.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setQuestions((prev) => prev.filter((x) => x.id !== q.id))
        showToast('Question deleted')
      } catch (err) {
        console.error('Delete error:', err)
        showToast('Failed to delete question', 'error')
      }

    })
  }

  // ── TEACHER: PAUSE/RESUME INTAKE ────────────────────────
  const togglePauseSession = () => runAction('pause', async () => {
    if (!isTeacher || !socketRef.current?.connected) return
    const finish = startActivity('Updating question intake...')
    try {
      await new Promise(resolve => socketRef.current.timeout(10000).emit(isPaused ? 'resume-session' : 'pause-session', code, (err, reply) => {
        if (err || !reply?.ok) showToast(reply?.message || 'Unable to change question intake. Please retry.', 'error')
        else setIsPaused(reply.isPaused)
        resolve()
      }))
    } finally { finish() }
  })

  // ── TEACHER: END SESSION ─────────────────────────────────
  const endSession = () => {
    setShowEndSessionModal(true)
  }

  const confirmEndSession = async () => {
    return runAction('end', async () => {
      try {
        const token = await getToken()
        await axios.patch(
          `${API}/api/sessions/${session.id}/end`,
          { user_id: dbUser?.id },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        showToast('Session ended. Redirecting to recap...')
        navigate(`/session/${code}/recap`)
      } catch (err) {
        console.error('End session error:', err)
        showToast('Failed to end session', 'error')
      }

    })
  }

  // ── TEACHER: BROADCAST TO CLASS (NOTE OR CODE) ───────────
  const handleBroadcast = async (data) => {
    if (!session || broadcasting) return
    setBroadcasting(true)
    try {
      const token = await getToken()
      const payload = {
        session_id: session.id,
        user_id: dbUser.id,
        content_type: data.type === 'note' ? 'NOTE' : 'CODE'
      }

      if (data.type === 'note') {
        payload.question_text = `${data.title ? data.title + ": " : ""}${data.message}`
      } else {
        payload.question_text = data.title || 'Code example'
        payload.code_snippet = data.code
        payload.code_language = data.language
      }

      const res = await axios.post(`${API}/api/questions`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setQuestions(prev => sortQ([...prev.filter(q => q.id !== res.data.id).map(q => q.status === 'PINNED' ? { ...q, status: 'PENDING', pinned_at: null } : q), res.data]))
      setShowBroadcastModal(false)
      showToast(data.type === 'note' ? '📢 Answer / Note broadcasted to class!' : '💻 Code snippet broadcasted to class!')
    } catch (err) {
      console.error('Broadcast error:', err)
      showToast('Failed to broadcast to class', 'error')
    } finally {
      setBroadcasting(false)
    }
  }

  // ── LIVE CLASSROOM POLL HANDLERS ─────────────────────────
  const pollAction = (event, data = {}) => runAction('poll', async () => {
    if (!socketRef.current?.connected) { showToast('Reconnect before using polls', 'error'); throw new Error('Not connected') }
    const finish = startActivity('Saving poll update...')
    try {
      await new Promise((resolve, reject) => socketRef.current.timeout(15000).emit(event, { sessionCode: code, ...data }, (err, reply) => {
        if (err || !reply?.ok) {
          const message = reply?.message || 'Poll update failed. Please retry.'
          showToast(message, 'error'); reject(new Error(message))
        } else { if (event === 'vote-poll') setMyPollVote(data.optionIndex); resolve() }
      }))
      return true
    } finally { finish() }
  })
  const handleLaunchPoll = async ({ question, options }) => {
    const launched = await pollAction('start-poll', { poll: { question, options } })
    if (launched) setShowCreatePollModal(false)
    return launched
  }
  const handleVotePoll = optionIndex => {
    if (activePoll?.active && myPollVote === null) void pollAction('vote-poll', { pollId: activePoll.id, optionIndex }).catch(() => {})
  }
  const handleEndPoll = () => { void pollAction('end-poll').catch(() => {}) }
  const handleRemovePoll = () => { void pollAction('remove-poll').catch(() => {}) }

  const copyCode = () => {
    navigator.clipboard.writeText(code)
    showToast('Code copied!')
  }

  if (loading) return <PageSkeleton label="Connecting to lecture hall..." />

  const pinnedQuestion = questions.find((q) => q.status === 'PINNED' && !q.is_answered)
  const unanswered = questions.filter((q) => !['FLAGGED', 'DISMISSED'].includes(q.status) && !q.is_answered && q.status !== 'ANSWERED')
  const answered = questions.filter((q) => !['FLAGGED', 'DISMISSED'].includes(q.status) && (q.is_answered || q.status === 'ANSWERED'))

  let displayQuestions = []
  if (filterTab === 'trending') {
    displayQuestions = [...unanswered].sort((a, b) => b.upvotes - a.upvotes || new Date(a.created_at) - new Date(b.created_at))
  } else if (filterTab === 'newest') {
    displayQuestions = [...unanswered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  } else if (filterTab === 'unanswered') {
    displayQuestions = unanswered
  }

  const answeredRate = questions.length > 0
    ? Math.round((answered.length / questions.length) * 100)
    : 0

  return (
    <div className={`room-layout-container ${isTeacher ? 'theme-faculty faculty-console-layout' : 'theme-student'}`}>
      {/* ── LEFT VERTICAL ICON RAIL (FACULTY ONLY) ── */}
      {isTeacher && (
        <aside className="room-vertical-rail">
          <div className="rail-top" onClick={() => navigate('/dashboard')} title="Return to Dashboard">
            <span className="rail-brand-badge">/A</span>
          </div>

          <div className="rail-nav-icons">
            <button
              className="rail-icon-btn active"
              title="Q&A Stream"
              onClick={() => {}}
            >
              <span className="rail-icon"><Icon name="message" /></span>
              <span className="rail-icon-label">Q&A</span>
            </button>
          </div>

          <div className="rail-bottom">
            <button
              className="rail-icon-btn"
              title="Return to Dashboard"
              onClick={() => navigate('/dashboard')}
            >
              <span className="rail-icon">←</span>
              <span className="rail-icon-label">Exit</span>
            </button>
          </div>
        </aside>
      )}

      {/* ── MAIN CONTENT ARENA ── */}
      <div className="room-main-arena">
        {connectionStatus !== 'connected' && <div className="room-connection-notice" role="status">Reconnecting to the classroom. Updates will refresh when the connection returns.</div>}
        {/* Topbar Header */}
        <SessionHeader
          session={session}
          code={code}
          isTeacher={isTeacher}
          sharingMedia={sharingMedia}
          shareInputRef={shareInputRef}
          materialsCount={materials.length}
          onToggleMaterials={() => setShowMaterialsDrawer((prev) => !prev)}
          onCopyCode={copyCode}
          onShareMedia={handleShareMedia}
          onExportPDF={() => exportSessionPDF(session, questions)}
          onEndSession={endSession}
          onBack={() => navigate('/dashboard')}
        />

        {/* FACULTY PODIUM 2-COLUMN VIEW */}
        {isTeacher ? (
          <div className="faculty-console-grid fade-up">
            {/* Left Column: Questions & Moderation Feed */}
            <div className="faculty-feed-column">
              <div className="faculty-column-header">
                <div>
                  <span className="faculty-eyebrow-tag">INSTRUCTOR PODIUM</span>
                  <h1 className="faculty-session-title">{session?.title || 'Live Lecture'}</h1>
                  <span className="faculty-session-course">{session?.course?.course_code || 'ROOM'} · {session?.subject || 'Lecture'}</span>
                </div>
              </div>

              {/* Classroom Media & Whiteboard for Faculty */}
              <div className="faculty-media-section">
                <div className="faculty-media-header">
                  <div className="faculty-media-title-row">
                    <h3><Icon name="lecture" /> Classroom Broadcast & Whiteboard</h3>
                    <span className="badge badge-amber">{sessionMedia.length}</span>
                  </div>
                  <div className="faculty-broadcast-actions">
                    <button
                      className="btn btn-secondary btn-sm faculty-upload-media-btn"
                      onClick={() => setShowBroadcastModal(true)}
                      title="Broadcast text answer, explanation, or code to class"
                    >
                      <Icon name="lecture" /> + Broadcast to Class
                    </button>
                    <button
                      className="btn btn-secondary btn-sm faculty-upload-media-btn"
                      onClick={() => setShowCreatePollModal(true)}
                      title="Launch a live class poll"
                    >
                      <Icon name="chart" /> + Quick Poll
                    </button>
                    <BusyButton busy={sharingMedia}
                      className="btn btn-secondary btn-sm faculty-upload-media-btn"
                      onClick={() => shareInputRef.current?.click()}
                      disabled={sharingMedia}
                      title="Share whiteboard photo or diagram to students"
                    >
                      {sharingMedia ? 'Uploading...' : 'Share diagram'}
                    </BusyButton>
                  </div>
                  <input
                    ref={shareInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleShareMedia}
                  />
                </div>

                <MediaStrip
                  sessionMedia={sessionMedia}
                  isTeacher={isTeacher}
                  pendingActions={pendingActions}
                  onDeleteMedia={deleteMedia}
                  onSaveToVault={handleSaveMediaToVault}
                  onExpandImage={setExpandedImage}
                />
              </div>

              {/* Live Classroom Poll Banner (Faculty Console) */}
              {activePoll && (
                <LivePollBanner
                  busy={pendingActions.has('poll')}
                  poll={activePoll}
                  isTeacher={isTeacher}
                  myVote={myPollVote}
                  onVote={handleVotePoll}
                  onEndPoll={handleEndPoll}
                  onRemovePoll={handleRemovePoll}
                  onDismiss={handleRemovePoll}
                />
              )}

              {/* Moderation Controls Tabs */}
              <div className="feed-controls-bar">
                <div className="feed-tabs">
                  <button
                    className={`feed-tab-btn ${filterTab === 'trending' ? 'active' : ''}`}
                    onClick={() => setFilterTab('trending')}
                  >
                    Top voted ({unanswered.length})
                  </button>

                  <button
                    className={`feed-tab-btn ${filterTab === 'newest' ? 'active' : ''}`}
                    onClick={() => setFilterTab('newest')}
                  >
                    Newest
                  </button>
                </div>
                <span className="feed-count-tag">{displayQuestions.length} in view</span>
              </div>

              {/* Questions Stream */}
              <div className="editorial-questions-feed">
                {displayQuestions.length === 0 ? (
                  <div className="room-empty-state fade-in">
                    <span className="empty-state-icon"><Icon name="message" /></span>
                    <h3>No questions in this filter</h3>
                    <p>Live student submissions will stream directly onto your podium.</p>
                  </div>
                ) : (
                  displayQuestions.map((q, i) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      saving={savingQuestionIds.has(q.id)}
                      savingAction={savingQuestionActions[q.id]}
                      pinDisabled={savingQuestionIds.has('spotlight')}
                      deleting={pendingActions.has(`delete-question:${q.id}`)}
                      isTeacher={isTeacher}
                      hasVoted={votedIds.has(q.id)}
                      isPinned={q.status === 'PINNED'}
                      isBookmarked={bookmarkedIds.has(q.id)}
                      savingBookmark={savingBookmarkIds.has(q.id)}
                      onUpvote={upvote}
                      onPin={togglePinQuestion}
                      onMarkAnswered={markAnswered}
                      onDelete={deleteQuestion}
                      onExpandImage={setExpandedImage}
                      onToggleBookmark={handleToggleBookmark}
                      onSubmitAnswerText={isTeacher ? handleSubmitAnswerText : null}
                      animDelay={`${i * 0.03}s`}
                    />
                  ))
                )}
              </div>

              {/* Answered Archive Below */}
              {answered.length > 0 && filterTab !== 'unanswered' && (
                <div className="answered-archive-section">
                  <div className="answered-archive-header">
                    <h3>Resolved Doubts ({answered.length})</h3>
                  </div>
                  <div className="editorial-questions-feed answered-feed">
                    {answered.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                      saving={savingQuestionIds.has(q.id)}
                      savingAction={savingQuestionActions[q.id]}
                      pinDisabled={savingQuestionIds.has('spotlight')}
                      deleting={pendingActions.has(`delete-question:${q.id}`)}
                        isTeacher={isTeacher}
                        hasVoted={votedIds.has(q.id)}
                        isPinned={false}
                        isBookmarked={bookmarkedIds.has(q.id)}
                      savingBookmark={savingBookmarkIds.has(q.id)}
                        onUpvote={upvote}
                        onPin={null}
                        onMarkAnswered={null}
                        onDelete={deleteQuestion}
                        onExpandImage={setExpandedImage}
                        onToggleBookmark={handleToggleBookmark}
                        onSubmitAnswerText={isTeacher ? handleSubmitAnswerText : null}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Stats & Session Controls Panel */}
            <aside className="faculty-sidebar-column">
              {/* Session Stats Card */}
              <div className="faculty-stats-widget card">
                <h3 className="widget-title">Live Session Metrics</h3>
                <div className="stats-metric-list">
                  <div className="stat-metric-item">
                    <span className="stat-label">Total Questions Asked</span>
                    <span className="stat-value">{questions.length}</span>
                  </div>
                  <div className="stat-metric-item">
                    <span className="stat-label">Resolved Doubts</span>
                    <span className="stat-value status-green">{answered.length}</span>
                  </div>
                  <div className="stat-metric-item">
                    <span className="stat-label">Open / Pending</span>
                    <span className="stat-value status-amber">{unanswered.length}</span>
                  </div>
                  <div className="stat-metric-item">
                    <span className="stat-label">Resolution Rate</span>
                    <span className="stat-value">{answeredRate}%</span>
                  </div>
                </div>
              </div>

              {/* Spotlighted Projector Preview Card */}
              {pinnedQuestion && (
                <div className="projector-spotlight-widget card fade-in">
                  <div className="spotlight-header">
                    <span className="spotlight-badge"><Icon name="lecture" /> ON CLASSROOM PROJECTOR</span>
                    <button
                      className="btn btn-ghost btn-sm unpin-btn"
                      onClick={() => togglePinQuestion(pinnedQuestion)}
                    >
                      Unpin
                    </button>
                  </div>
                  <p className="spotlight-text">"{pinnedQuestion.question_text}"</p>
                  <button
                    className="btn btn-primary btn-sm spotlight-answer-cta"
                    onClick={() => markAnswered(pinnedQuestion)}
                  >
                    ✓ Mark Answered & Dismiss
                  </button>
                </div>
              )}

              {/* Podium Controls Card */}
              <div className="faculty-controls-widget card">
                <h3 className="widget-title">Podium Quick Actions</h3>
                <div className="controls-button-stack">
                  {/* Pause / Resume Intake Toggle */}
                  <BusyButton busy={pendingActions.has('pause')}
                    className={`btn ${isPaused ? 'btn-primary' : 'btn-secondary'} control-action-btn`}
                    onClick={togglePauseSession}
                    title="Freeze student submissions during explanation"
                  >
                    <span>{isPaused ? "Resume Question Intake" : "Pause Question Intake"}</span>
                  </BusyButton>



                  <button
                    className="btn btn-ghost control-action-btn"
                    onClick={() => exportSessionPDF(session, questions)}
                    title="Download complete session Q&A summary"
                  >
                    <span>↓ Export Q&A Summary PDF</span>
                  </button>


                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* STUDENT SINGLE COLUMN ARENA */
          <div className="room-arena-scroll">
            <div className="room-content-container">
              {/* Lecture Hero Header */}
              <div className="lecture-hero-header fade-up">
                <div className="lecture-header-left">
                  <div className="lecture-topic-row">
                    <h1 className="lecture-topic-title">{session?.title || 'Live Lecture'}</h1>
                    <span className="lecture-course-badge">
                      {session?.course?.course_code || 'ROOM'}
                    </span>
                  </div>
                  {session?.subject && (
                    <p className="lecture-subject-name">{session.subject}</p>
                  )}
                </div>
              </div>

            {/* Live Classroom Poll Banner (Student Arena) */}
            {activePoll && (
              <LivePollBanner
                  busy={pendingActions.has('poll')}
                poll={activePoll}
                isTeacher={isTeacher}
                myVote={myPollVote}
                onVote={handleVotePoll}
                onEndPoll={handleEndPoll}
                onDismiss={() => setActivePoll(null)}
              />
            )}

            {/* Pinned Question Spotlight Banner */}
            <PinnedQuestionBanner
              pinnedQuestion={pinnedQuestion}
              isTeacher={isTeacher}
              onUnpin={togglePinQuestion}
              onMarkAnswered={markAnswered}
              onExpandImage={setExpandedImage}
            />

            {/* Shared Media Gallery Strip */}
            <MediaStrip
              sessionMedia={sessionMedia}
              isTeacher={isTeacher}
              pendingActions={pendingActions}
                  onDeleteMedia={deleteMedia}
              onSaveToVault={handleSaveMediaToVault}
              onExpandImage={setExpandedImage}
            />

            {/* Pause Notification for Students */}
            {isPaused && (
              <div className="session-paused-banner fade-in">
                <span><Icon name="pause" /> <strong>Intake Paused:</strong> Professor is currently explaining a concept. New question submissions will resume shortly.</span>
              </div>
            )}

            {/* Student Anonymous Composer Dock */}
            <QuestionInput
              questionText={questionText}
              onChangeText={setQuestionText}
              codeSnippet={codeSnippet}
              onChangeCodeSnippet={setCodeSnippet}
              codeLanguage={codeLanguage}
              onChangeCodeLanguage={setCodeLanguage}
              showCodeEditor={showCodeInput}
              onToggleCodeEditor={setShowCodeInput}
              onSubmit={() => postQuestion(false)}
              posting={posting}
              checkingDuplicate={checkingDuplicate}
              uploadingImage={uploadingImage}
              cooldown={cooldown}
              error={error}
              selectedImage={selectedImage}
              imagePreview={imagePreview}
              onSelectImage={handleImageSelect}
              onRemoveImage={removeSelectedImage}
              fileInputRef={fileInputRef}
            />

            {/* Feed Filter Controls Bar */}
            <div className="feed-controls-bar fade-up">
              <div className="feed-tabs">
                <button
                  className={`feed-tab-btn ${filterTab === 'trending' ? 'active' : ''}`}
                  onClick={() => setFilterTab('trending')}
                >
                  Top voted
                </button>
                <button
                  className={`feed-tab-btn ${filterTab === 'newest' ? 'active' : ''}`}
                  onClick={() => setFilterTab('newest')}
                >
                  Newest
                </button>

              </div>
              <span className="feed-count-tag">{displayQuestions.length} question{displayQuestions.length === 1 ? '' : 's'}</span>
            </div>

            {/* Questions Stream */}
            <div className="editorial-questions-feed">
              {displayQuestions.length === 0 ? (
                <div className="room-empty-state fade-in">
                  <span className="empty-state-icon"><Icon name="message" /></span>
                  <h3>No questions in this view yet</h3>
                  <p>Be the first student to ask an anonymous question above!</p>
                </div>
              ) : (
                displayQuestions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    isTeacher={isTeacher}
                    hasVoted={votedIds.has(q.id)}
                    isPinned={q.status === 'PINNED'}
                    isBookmarked={bookmarkedIds.has(q.id)}
                      savingBookmark={savingBookmarkIds.has(q.id)}
                    onUpvote={upvote}
                    onPin={togglePinQuestion}
                    onMarkAnswered={markAnswered}
                    onDelete={deleteQuestion}
                    onExpandImage={setExpandedImage}
                    onToggleBookmark={handleToggleBookmark}
                    onSubmitAnswerText={isTeacher ? handleSubmitAnswerText : null}
                    animDelay={`${i * 0.03}s`}
                  />
                ))
              )}
            </div>

            {/* Answered Questions Archive (Collapsible Accordion) */}
            {answered.length > 0 && (
              <div className="answered-archive-section fade-in">
                <button
                  type="button"
                  className="answered-accordion-toggle"
                  aria-expanded={showResolved}
                  onClick={() => setShowResolved((prev) => !prev)}
                >
                  <div className="accordion-title-left">
                    <span className="accordion-chevron">{showResolved ? '▼' : ""}</span>
                    <span className="accordion-title-text">Resolved Questions ({answered.length})</span>
                  </div>
                  <span className="answered-hint">Answered by Professor during lecture</span>
                </button>

                {showResolved && (
                  <div className="editorial-questions-feed answered-feed fade-in">
                    {answered.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                      saving={savingQuestionIds.has(q.id)}
                      savingAction={savingQuestionActions[q.id]}
                      pinDisabled={savingQuestionIds.has('spotlight')}
                      deleting={pendingActions.has(`delete-question:${q.id}`)}
                        isTeacher={isTeacher}
                        hasVoted={votedIds.has(q.id)}
                        isPinned={false}
                        isBookmarked={bookmarkedIds.has(q.id)}
                      savingBookmark={savingBookmarkIds.has(q.id)}
                        onUpvote={upvote}
                        onPin={null}
                        onMarkAnswered={null}
                        onDelete={deleteQuestion}
                        onExpandImage={setExpandedImage}
                        onToggleBookmark={handleToggleBookmark}
                        onSubmitAnswerText={isTeacher ? handleSubmitAnswerText : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox for Expanded Images */}
      <LightboxModal
        image={expandedImage}
        imageUrl={expandedImage}
        onClose={() => setExpandedImage(null)}
        isTeacher={isTeacher}
        onSaveToVault={handleSaveMediaToVault}
      />

      {/* Materials & Slides Drawer */}
      <MaterialsDrawer
        isOpen={showMaterialsDrawer}
        onClose={() => setShowMaterialsDrawer(false)}
        materials={materials}
        isTeacher={isTeacher}
        onUploadMaterial={handleUploadMaterial}
        onDeleteMaterial={handleDeleteMaterial}
        uploading={uploadingMaterial}
      />

      {/* Faculty Broadcast Modal (Text Answer or Code) */}
      <TeacherBroadcastModal
        isOpen={showBroadcastModal}
        onClose={() => !broadcasting && setShowBroadcastModal(false)}
        onBroadcast={handleBroadcast}
        broadcasting={broadcasting}
      />

      {/* Teacher Quick Poll Modal */}
      <CreatePollModal
        busy={pendingActions.has('poll')}
        isOpen={showCreatePollModal}
        onClose={() => !pendingActions.has('poll') && setShowCreatePollModal(false)}
        onLaunch={handleLaunchPoll}
      />

      {/* Semantic Duplicate Intercept Modal */}
      <DuplicatePromptModal
        busy={pendingActions.has('duplicate')}
        isOpen={Boolean(duplicateMatch)}
        matchedQuestion={duplicateMatch}
        newQuestionText={duplicatePendingText || questionText}
        onUpvoteExisting={handleUpvoteExisting}
        onPostAnyway={handlePostAnyway}
        onClose={() => {
          setDuplicateMatch(null)
          setDuplicatePendingText('')
        }}
      />

      {/* ── MODAL: CONFIRM END SESSION ── */}
      {showEndSessionModal && (
        <div className="modal-backdrop" onClick={() => !pendingActions.has('end') && setShowEndSessionModal(false)}>
          <div className="modal-content academic-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-danger-header">
              <span className="danger-icon"><Icon name="alert" /></span>
              <div>
                <h2>Conclude Lecture Session?</h2>
                <p className="modal-sub">Room #{code} — {session?.title}</p>
              </div>
            </div>

            <div className="delete-alert-box live-alert">
              This will conclude the active lecture room for all participating students, freeze live question intake, and automatically generate a permanent lecture recap.
            </div>

            <div className="modal-actions">
              <button disabled={pendingActions.has('end')}
                type="button"
                className="btn btn-ghost"
                onClick={() => !pendingActions.has('end') && setShowEndSessionModal(false)}
              >
                Keep Room Open
              </button>
              <BusyButton busy={pendingActions.has('end')}
                type="button"
                className="btn btn-primary btn-danger"
                onClick={confirmEndSession}
              >
                Conclude Lecture →
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRM DELETE MATERIAL ── */}
      {materialToDelete && (
        <div className="modal-backdrop" onClick={() => !pendingActions.has('delete-material') && setMaterialToDelete(null)}>
          <div className="modal-content academic-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-danger-header">
              <span className="danger-icon"><Icon name="alert" /></span>
              <div>
                <h2>Remove Study Material?</h2>
                <p className="modal-sub">{materialToDelete.title}</p>
              </div>
            </div>

            <div className="delete-alert-box">
              This will remove the file from this session's study drawer.
            </div>

            <div className="modal-actions">
              <button disabled={pendingActions.has('delete-material')}
                type="button"
                className="btn btn-ghost"
                onClick={() => !pendingActions.has('delete-material') && setMaterialToDelete(null)}
              >
                Cancel
              </button>
              <BusyButton busy={pendingActions.has('delete-material')}
                type="button"
                className="btn btn-primary btn-danger"
                onClick={confirmDeleteMaterial}
              >
                Delete File
              </BusyButton>
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
