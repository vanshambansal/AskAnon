
import jsPDF from 'jspdf'

export const exportSessionPDF = (session, questions) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W = 210  // page width
  const margin = 20
  const contentW = W - margin * 2
  let y = 0

  // ── COLORS ──────────────────────────────────────────────
  const C = {
    bg:      [10, 15, 13],
    accent:  [240, 180, 41],
    green:   [52, 201, 122],
    text:    [232, 240, 236],
    text2:   [157, 184, 168],
    text3:   [90, 122, 104],
    surface: [26, 40, 32],
    border:  [42, 63, 52],
  }

  // ── HELPERS ──────────────────────────────────────────────
  const setFont = (size, style = 'normal', color = C.text) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
    doc.setTextColor(...color)
  }

  const fillRect = (x, fy, w, h, color) => {
    doc.setFillColor(...color)
    doc.rect(x, fy, w, h, 'F')
  }

  const drawLine = (x1, fy, x2, color = C.border) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(0.3)
    doc.line(x1, fy, x2, fy)
  }

  const wrapText = (text, x, fy, maxW, lineH, color = C.text, size = 10) => {
    setFont(size, 'normal', color)
    const lines = doc.splitTextToSize(text, maxW)
    doc.text(lines, x, fy)
    return lines.length * lineH
  }

  const addPage = () => {
    doc.addPage()
    // dark bg on new page
    fillRect(0, 0, W, 297, C.bg)
    y = 20
  }

  const checkPageBreak = (needed) => {
    if (y + needed > 277) addPage()
  }

  // ── PAGE 1 — FULL DARK BG ────────────────────────────────
  fillRect(0, 0, W, 297, C.bg)

  // ── HEADER BAND ──────────────────────────────────────────
  fillRect(0, 0, W, 52, C.surface)
  drawLine(0, 52, W, C.border)

  // Logo mark
  doc.setFillColor(...C.accent)
  doc.roundedRect(margin, 12, 14, 14, 2, 2, 'F')
  setFont(7, 'bold', C.bg)
  doc.text('AQ', margin + 7, 21, { align: 'center' })

  // App name
  setFont(13, 'bold', C.text)
  doc.text('AskAnon', margin + 18, 21)

  // Right side — date
  setFont(8, 'normal', C.text3)
  const dateStr = new Date(session.started_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
  doc.text(dateStr, W - margin, 18, { align: 'right' })

  // Session title
  setFont(18, 'bold', C.text)
  doc.text(session.title, margin, 42)

  // Subject badge
  if (session.subject) {
    const subjW = doc.getTextWidth(session.subject) + 8
    doc.setFillColor(...C.accent)
    doc.roundedRect(W - margin - subjW, 35, subjW, 7, 1.5, 1.5, 'F')
    setFont(7, 'bold', C.bg)
    doc.text(session.subject, W - margin - subjW / 2, 40, { align: 'center' })
  }

  y = 66

  // ── STATS ROW ────────────────────────────────────────────
  const unanswered = questions.filter(q => !q.is_answered)
  const answered   = questions.filter(q => q.is_answered)
  const totalVotes = questions.reduce((s, q) => s + q.upvotes, 0)
  const topQ       = [...questions].sort((a, b) => b.upvotes - a.upvotes)[0]

  const stats = [
    { label: 'Total Questions', value: String(questions.length) },
    { label: 'Answered',        value: String(answered.length) },
    { label: 'Total Votes',     value: String(totalVotes) },
    { label: 'Most Votes',      value: topQ ? String(topQ.upvotes) : '0' },
  ]

  const statW = contentW / 4
  stats.forEach((s, i) => {
    const sx = margin + i * statW
    fillRect(sx, y, statW - 3, 22, C.surface)
    // accent top border
    doc.setFillColor(...C.accent)
    doc.rect(sx, y, statW - 3, 1.5, 'F')

    setFont(16, 'bold', C.accent)
    doc.text(s.value, sx + (statW - 3) / 2, y + 11, { align: 'center' })
    setFont(7, 'normal', C.text3)
    doc.text(s.label, sx + (statW - 3) / 2, y + 17, { align: 'center' })
  })

  y += 30

  // ── SESSION META ─────────────────────────────────────────
  const startTime = new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const endTime   = session.ended_at
    ? new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Ongoing'

  setFont(8, 'normal', C.text3)
  doc.text(`Session Code: ${session.session_code}   ·   Started: ${startTime}   ·   Ended: ${endTime}`, margin, y)

  y += 12
  drawLine(margin, y, W - margin)
  y += 10

  // ── UNANSWERED QUESTIONS ─────────────────────────────────
  if (unanswered.length > 0) {
    setFont(11, 'bold', C.text)
    doc.text(`Questions  (${unanswered.length})`, margin, y)
    setFont(8, 'normal', C.text3)
    doc.text('sorted by votes', W - margin, y, { align: 'right' })
    y += 8

    const sorted = [...unanswered].sort((a, b) => b.upvotes - a.upvotes)

    sorted.forEach((q, i) => {
      const lineH    = 5
      const lines    = doc.splitTextToSize(q.question_text, contentW - 28)
      const cardH    = Math.max(18, lines.length * lineH + 12)

      checkPageBreak(cardH + 4)

      // card bg
      fillRect(margin, y, contentW, cardH, C.surface)

      // left accent bar (thicker for top voted)
      const barColor = i === 0 ? C.accent : C.border
      doc.setFillColor(...barColor)
      doc.rect(margin, y, 2.5, cardH, 'F')

      // vote box
      fillRect(margin + 5, y + cardH / 2 - 7, 14, 14, C.bg)
      setFont(10, 'bold', C.accent)
      doc.text(String(q.upvotes), margin + 12, y + cardH / 2 + 1, { align: 'center' })
      setFont(6, 'normal', C.text3)
      doc.text('votes', margin + 12, y + cardH / 2 + 6, { align: 'center' })

      // question text
      setFont(9, 'normal', C.text)
      doc.text(lines, margin + 24, y + 8)

      // time
      const qTime = new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setFont(7, 'normal', C.text3)
      doc.text(qTime, W - margin - 2, y + cardH - 4, { align: 'right' })

      y += cardH + 3
    })
  }

  // ── ANSWERED QUESTIONS ───────────────────────────────────
  if (answered.length > 0) {
    checkPageBreak(20)
    y += 4
    drawLine(margin, y, W - margin)
    y += 10

    setFont(11, 'bold', C.green)
    doc.text(`Answered  (${answered.length})`, margin, y)
    y += 8

    answered.forEach(q => {
      const lineH = 5
      const lines = doc.splitTextToSize(q.question_text, contentW - 28)
      const cardH = Math.max(16, lines.length * lineH + 10)

      checkPageBreak(cardH + 4)

      fillRect(margin, y, contentW, cardH, [15, 30, 22])
      // green left bar
      doc.setFillColor(...C.green)
      doc.rect(margin, y, 2.5, cardH, 'F')

      // checkmark circle
      doc.setFillColor(...C.green)
      doc.circle(margin + 12, y + cardH / 2, 5, 'F')
      setFont(9, 'bold', [10, 15, 13])
      doc.text('✓', margin + 12, y + cardH / 2 + 1.5, { align: 'center' })

      setFont(9, 'normal', C.text2)
      doc.text(lines, margin + 24, y + 8)

      y += cardH + 3
    })
  }

  // ── FOOTER ON LAST PAGE ──────────────────────────────────
  checkPageBreak(16)
  y = 285
  drawLine(margin, y - 6, W - margin)
  setFont(7, 'normal', C.text3)
  doc.text('Generated by AskAnon · Ask freely, learn fearlessly · Chitkara University', W / 2, y, { align: 'center' })

  // ── SAVE ─────────────────────────────────────────────────
  const filename = `AskAnon_${session.title.replace(/\s+/g, '_')}_${session.session_code}.pdf`
  doc.save(filename)
}