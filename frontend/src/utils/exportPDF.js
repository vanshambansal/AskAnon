import { jsPDF } from 'jspdf'

/**
 * Generates a clean, academic editorial PDF transcript of the session Q&A.
 * Uses high-contrast printable white paper theme with brand crimson accents,
 * structured KPI summary, code snippet rendering, and pagination.
 */
export const exportSessionPDF = (session, questions = [], aiInsights = null, options = {}) => {
  questions = questions.filter(q => !['FLAGGED', 'DISMISSED'].includes(q.status))
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const fontFamily = options.fonts ? 'NotoSans' : 'helvetica'
  if (options.fonts) {
    for (const [style, data] of [['normal', options.fonts.regular], ['bold', options.fonts.bold]]) {
      const file = `NotoSans-${style}.ttf`
      doc.addFileToVFS(file, data)
      doc.addFont(file, fontFamily, style)
    }
  }

  let insights = aiInsights
  if (!insights && session?.ai_summary) {
    if (typeof session.ai_summary === 'string') {
      try { insights = JSON.parse(session.ai_summary) } catch { /* No cached value is available; use the normal loading path. */ }
    } else {
      insights = session.ai_summary
    }
  }

  if (insights?.version !== 2 || insights?.status !== 'ready') insights = null

  const W = 210
  const H = 297
  const margin = 18
  const contentW = W - margin * 2
  let y = 0
  let currentPage = 1

  // Editorial Palette (Print-Friendly Clean Paper)
  const C = {
    bg:          [255, 255, 255],
    cardBg:      [248, 250, 252],
    cardBorder:  [226, 232, 240],
    textPrimary: [15, 23, 42],
    textMuted:   [100, 116, 139],
    textSubtle:  [148, 163, 184],
    crimson:     [225, 29, 72],
    crimsonLight:[255, 241, 242],
    emerald:     [16, 185, 129],
    emeraldLight:[236, 253, 245],
    amber:       [217, 119, 6],
    amberLight:  [254, 243, 199],
    indigo:      [99, 102, 241],
    indigoLight: [238, 242, 255],
    codeBg:      [30, 30, 46],
    codeText:    [205, 214, 244]
  }

  const setFont = (size, style = 'normal', color = C.textPrimary) => {
    doc.setFontSize(size)
    doc.setFont(fontFamily, style)
    doc.setTextColor(...color)
  }

  const fillRect = (x, fy, w, h, color) => {
    doc.setFillColor(...color)
    doc.rect(x, fy, w, h, 'F')
  }

  const drawLine = (x1, fy, x2, color = C.cardBorder, width = 0.3) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(width)
    doc.line(x1, fy, x2, fy)
  }

  const renderFooter = () => {
    drawLine(margin, H - 14, W - margin, C.cardBorder, 0.25)
    setFont(8, 'normal', C.textSubtle)
    doc.text('AskAnon Academic Lecture Transcript · Confidential & Educational', margin, H - 9)
    doc.text(`Page ${currentPage}`, W - margin, H - 9, { align: 'right' })
  }

  const addPage = () => {
    renderFooter()
    doc.addPage()
    currentPage++
    y = 20
  }

  const checkPageBreak = (neededHeight) => {
    if (y + neededHeight > H - 20) {
      addPage()
    }
  }

  // ── HEADER BANNER ─────────────────────────────────────────
  // Top brand bar
  fillRect(0, 0, W, 4, C.crimson)

  y = 16

  // Logo / Brand Monogram
  fillRect(margin, y, 14, 14, C.crimson)
  setFont(8, 'bold', [255, 255, 255])
  doc.text('/A', margin + 7, y + 9.5, { align: 'center' })

  // Brand Name & Subtitle
  setFont(14, 'bold', C.textPrimary)
  doc.text('AskAnon', margin + 18, y + 6.5)
  setFont(8, 'normal', C.textMuted)
  doc.text('Live Lecture Q&A Transcript & Doubts Ledger', margin + 18, y + 12)

  // Date Tag (Right aligned)
  const dateStr = session.started_at
    ? new Date(session.started_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-US')
  setFont(9, 'bold', C.textMuted)
  doc.text(dateStr, W - margin, y + 7, { align: 'right' })

  y += 20
  drawLine(margin, y, W - margin, C.cardBorder)
  y += 8

  // ── SESSION TITLE & COURSE CODE ───────────────────────────
  const courseCode = session.course?.course_code || 'ROOM'
  const courseTitle = session.subject || session.course?.title || 'Classroom Session'

  setFont(8, 'bold', C.crimson)
  const metadataLines = doc.splitTextToSize(`${courseCode} / #${session.session_code}`, contentW)
  doc.text(metadataLines, margin, y)
  y += metadataLines.length * 4 + 4
  setFont(9, 'normal', C.textMuted)
  const subjectLines = doc.splitTextToSize(courseTitle, contentW)
  doc.text(subjectLines, margin, y)
  y += subjectLines.length * 4.5 + 6

  // Large Lecture Title
  setFont(17, 'bold', C.textPrimary)
  const titleLines = doc.splitTextToSize(session.title || 'Live Classroom Lecture', contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 7 + 4

  // Time metrics subrow
  const startTime = session.started_at
    ? new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'N/A'
  const endTime = session.ended_at
    ? new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Concluded'
  setFont(8.5, 'normal', C.textMuted)
  doc.text(`Started: ${startTime}   ·   Ended: ${endTime}   ·   Moderated Live on AskAnon Podium`, margin, y)

  y += 10

  // ── EXECUTIVE KPI CARDS ───────────────────────────────────
  const inquiries = questions.filter(q => !q.content_type || q.content_type === 'QUESTION')
  const unanswered = inquiries.filter(q => !q.is_answered && q.status !== 'ANSWERED')
  const answered   = inquiries.filter(q => q.is_answered || q.status === 'ANSWERED')
  const totalVotes = inquiries.reduce((acc, q) => acc + (q.upvotes || 0), 0)
  const resolutionRate = inquiries.length > 0 ? Math.round((answered.length / inquiries.length) * 100) : 0

  const kpis = [
    { label: 'TOTAL INQUIRIES', value: String(inquiries.length), color: C.textPrimary },
    { label: 'RESOLVED DOUBTS', value: `${answered.length} (${resolutionRate}%)`, color: C.emerald },
    { label: 'OPEN INQUIRIES', value: String(unanswered.length), color: C.crimson },
    { label: 'TOTAL UPVOTES', value: String(totalVotes), color: C.textPrimary }
  ]

  const kpiW = (contentW - 9) / 4
  kpis.forEach((kpi, i) => {
    const kx = margin + i * (kpiW + 3)
    fillRect(kx, y, kpiW, 18, C.cardBg)
    doc.setDrawColor(...C.cardBorder)
    doc.setLineWidth(0.3)
    doc.rect(kx, y, kpiW, 18, 'S')

    setFont(13, 'bold', kpi.color)
    doc.text(kpi.value, kx + kpiW / 2, y + 8, { align: 'center' })
    setFont(6.5, 'bold', C.textMuted)
    doc.text(kpi.label, kx + kpiW / 2, y + 14, { align: 'center' })
  })

  y += 24

  const writeLines = (text, { size = 9.5, style = 'normal', color = C.textPrimary, code = false, indent = 0 } = {}) => {
    setFont(size, style, color)
    const codeFont = [...String(text)].some(character => character.codePointAt(0) > 127) ? fontFamily : 'courier'
    if (code) doc.setFont(codeFont, 'normal')
    const lines = doc.splitTextToSize(String(text || ''), contentW - indent)
    const lineHeight = code ? 4 : 4.8
    lines.forEach(line => {
      checkPageBreak(lineHeight + 2)
      setFont(size, style, color)
      if (code) doc.setFont(codeFont, 'normal')
      if (code) fillRect(margin, y - 3.1, contentW, lineHeight, C.cardBg)
      doc.text(line, margin + indent, y)
      y += lineHeight
    })
    y += 3
  }
  const section = title => {
    checkPageBreak(20)
    y += 4
    setFont(11, 'bold', C.crimson)
    doc.text(title, margin, y)
    y += 4
    drawLine(margin, y, W - margin, C.cardBorder)
    y += 7
  }

  if (insights) {
    section('Lecture analysis')
    writeLines(insights.core_concepts.join(' / '), { style: 'bold' })
    writeLines('Questions and learning gaps', { style: 'bold' })
    writeLines(insights.student_misconceptions)
    writeLines('Revision guidance', { style: 'bold' })
    writeLines(insights.exam_revision_note)
    if (options.isTeacher !== false) {
      writeLines('Instructor follow-up', { style: 'bold' })
      writeLines(insights.action_for_next_lecture)
    }
    writeLines('AI analysis is based on recorded discussion. Review it against your lecture materials.', { size: 8, color: C.textMuted })
  }

  const renderQuestionBlock = (q, isAnsweredSection = false) => {
    checkPageBreak(25)
    const type = q.content_type && q.content_type !== 'QUESTION' ? 'Instructor broadcast' : 'Anonymous question'
    writeLines(`${type} | ${isAnsweredSection ? 'Answered' : 'Open'} | ${q.upvotes || 0} upvotes`, { size: 8, style: 'bold', color: C.textMuted })
    if (q.question_text) writeLines(q.question_text, { style: 'bold' })
    if (q.code_snippet) {
      writeLines(`Code: ${q.code_language || 'text'}`, { size: 8, color: C.textMuted })
      writeLines(q.code_snippet, { size: 8, code: true, indent: 2 })
    }
    if (q.answer_text) {
      writeLines('Written answer', { style: 'bold', color: C.emerald })
      writeLines(q.answer_text)
    }
    if (q.image_url) {
      checkPageBreak(12)
      doc.textWithLink('View attached image', margin, y, { url: q.image_url })
      y += 8
    }
    drawLine(margin, y, W - margin)
    y += 7
  }

  // ── SECTION: OPEN / TOP-VOTED QUESTIONS ───────────────────
  if (unanswered.length > 0) {
    checkPageBreak(18)
    setFont(11, 'bold', C.textPrimary)
    doc.text(`Open & Top-Voted Inquiries (${unanswered.length})`, margin, y)
    setFont(8, 'normal', C.textMuted)
    doc.text('Ranked by student upvotes', W - margin, y, { align: 'right' })
    y += 4
    drawLine(margin, y, W - margin, C.cardBorder, 0.2)
    y += 6

    const sortedUnanswered = [...unanswered].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    sortedUnanswered.forEach((q) => renderQuestionBlock(q, false))
  }

  // ── SECTION: RESOLVED DOUBTS ──────────────────────────────
  if (answered.length > 0) {
    checkPageBreak(22)
    y += 4
    setFont(11, 'bold', C.emerald)
    doc.text(`Resolved Doubts (${answered.length})`, margin, y)
    setFont(8, 'normal', C.textMuted)
    doc.text('Answered by Professor during lecture', W - margin, y, { align: 'right' })
    y += 4
    drawLine(margin, y, W - margin, C.cardBorder, 0.2)
    y += 6

    const sortedAnswered = [...answered].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    sortedAnswered.forEach((q) => renderQuestionBlock(q, true))
  }

  const broadcasts = questions.filter(q => q.content_type && q.content_type !== 'QUESTION')
  if (broadcasts.length) {
    section('Instructor broadcasts')
    broadcasts.forEach(q => renderQuestionBlock(q, false))
  }
  if (options.polls?.length) {
    section('Classroom polls')
    options.polls.forEach(poll => {
      writeLines(poll.question, { style: 'bold' })
      ;(poll.options || []).forEach(option => writeLines(`${option.text}: ${option.votes || 0} votes`))
    })
  }
  if (options.materials?.length || options.media?.length) {
    section('Lecture resources')
    ;[...(options.materials || []).map(m => ({ title: m.title, url: m.file_url })), ...(options.media || []).map(m => ({ title: m.caption || 'Whiteboard image', url: m.image_url }))].forEach(item => {
      writeLines(item.title, { style: 'bold' })
      checkPageBreak(10)
      doc.textWithLink('Open resource', margin, y, { url: item.url })
      y += 9
    })
  }

  // Render footer on the final page
  renderFooter()

  // Save the PDF
  const safeSessionTitle = (session.title || 'Session').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `AskAnon_Transcript_${safeSessionTitle}_${session.session_code || 'RECAP'}.pdf`
  if (options.download !== false) doc.save(filename)
  return doc
}
