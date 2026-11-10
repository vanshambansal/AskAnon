import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
import useNow from '../../hooks/useNow'
import React, { useState } from 'react'

export default function QuestionCard({
  question,
  isTeacher,
  hasVoted,
  isPinned,
  isBookmarked = false,
  saving = false,
  savingAction,
  savingBookmark = false,
  deleting = false,
  pinDisabled = false,
  onUpvote,
  onPin,
  onMarkAnswered,
  onDelete,
  onExpandImage,
  onToggleBookmark,
  onSubmitAnswerText,
  animDelay = '0s'
}) {
  const now = useNow()
  const [copiedCode, setCopiedCode] = useState(false)
  const [showAnswerBox, setShowAnswerBox] = useState(false)
  const [answerInput, setAnswerInput] = useState(question.answer_text || '')
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const [showRelatedPopup, setShowRelatedPopup] = useState(false)

  const isAnswered = question.is_answered || question.status === 'ANSWERED'

  // Relative time helper
  const getRelativeTime = (isoString) => {
    if (!isoString) return ''
    const diff = Math.floor((now - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    return `${Math.floor(diff / 3600)} hr ago`
  }

  const handleCopyCode = (e) => {
    e.stopPropagation()
    if (!question.code_snippet) return
    navigator.clipboard.writeText(question.code_snippet)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleSaveAnswer = async () => {
    if (!answerInput.trim() || !onSubmitAnswerText) return
    setSubmittingAnswer(true)
    try {
      await onSubmitAnswerText(question.id, answerInput.trim())
      setShowAnswerBox(false)
    } catch {
      // The parent displays the API error; keep the draft open for retry.
    } finally {
      setSubmittingAnswer(false)
    }
  }

  return (
    <div
      className={`editorial-q-card fade-up ${isAnswered ? 'is-answered' : ''} ${isPinned ? 'is-pinned' : ''}`}
      style={{ animationDelay: animDelay }}
    >
      {/* Upvote Button Square on Left */}
      <button
        className={`q-upvote-square ${hasVoted ? 'voted' : ''} ${isAnswered ? 'answered' : ''}`}
        onClick={() => onUpvote(question)}
        disabled={isTeacher || hasVoted || isAnswered}
        title={isTeacher ? 'Faculty cannot upvote' : hasVoted ? 'Already upvoted' : isAnswered ? 'Answered question' : 'Upvote this doubt'}
      >
        <span className="upvote-icon">▲</span>
        <span className="upvote-number">{question.upvotes}</span>
      </button>

      {/* Main Question Body */}
      <div className="q-card-main">
        {/* Status Highlights */}
        {isPinned && !isAnswered && (
          <div className="pinned-badge-strip">
            <span><Icon name="bookmark" /> Pinned by Professor</span>
          </div>
        )}

        {/* Semantic Related Doubt Indicator */}
        {question.related_text && (
          <div className="related-doubt-strip fade-in">
            <button
              type="button"
              className="related-doubt-toggle-btn"
              onClick={() => setShowRelatedPopup(!showRelatedPopup)}
              title="Click to view connected doubt"
            >
              <span className="related-doubt-tag"><Icon name="message" /> Related Doubt</span>
              <span className="related-doubt-toggle-icon">{showRelatedPopup ? '▲ Hide' : '▼ View connection'}</span>
            </button>
            {showRelatedPopup && (
              <div className="related-doubt-popover fade-in">
                <span className="related-popover-label">Connected doubt asked earlier:</span>
                <p className="related-popover-text">"{question.related_text}"</p>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          {question.question_text?.trim() ? (
            <p className="q-card-text" style={{ flex: 1, margin: 0 }}>{question.question_text}</p>
          ) : (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>
              {question.code_snippet ? '</> Code Attachment' : "Image Attachment"}
            </span>
          )}
          {onToggleBookmark && (
            <button
              type="button"
              className={`q-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
              onClick={() => onToggleBookmark(question.id)}
              title={isBookmarked ? 'Remove from Saved Doubts' : 'Save doubt to your personal notebook'}
              aria-label={isBookmarked ? 'Remove from Saved Doubts' : 'Save doubt to your personal notebook'}
              aria-pressed={isBookmarked}
              disabled={savingBookmark}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                lineHeight: 1,
                padding: '2px 4px',
                color: isBookmarked ? '#F59E0B' : 'var(--text-muted)',
                transition: 'transform 0.15s ease, color 0.15s ease'
              }}
            >
              <Icon name="star" />
            </button>
          )}
        </div>

        {/* In-Class Code Snippet */}
        {question.code_snippet && (
          <div className="q-code-snippet-container">
            <div className="q-code-header">
              <div className="q-code-lang-tag">
                <span className="code-lang-icon">&lt;/&gt;</span>
                <span className="code-lang-name">
                  {(question.code_language || 'code').toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                className={`q-copy-code-btn ${copiedCode ? 'copied' : ''}`}
                onClick={handleCopyCode}
                title="Copy code to clipboard"
              >
                {copiedCode ? '✓ Copied' : "Copy Code"}
              </button>
            </div>
            <pre className="q-code-pre">
              <code>{question.code_snippet}</code>
            </pre>
          </div>
        )}

        {/* Attached Diagram / Screenshot */}
        {question.image_url && (
          <div className="q-image-preview-box">
            <img
              src={question.image_url}
              alt="Question attachment"
              className="q-attached-image"
              onClick={() => onExpandImage({
                image_url: question.image_url,
                caption: `Attachment: ${question.question_text.slice(0, 60)}`
              })}
              title="Click to expand full diagram"
            />
          </div>
        )}

        {/* Professor's Written Answer */}
        {question.answer_text && (
          <p className="spotlight-inline-answer">
            <strong><Icon name="user" /> Professor's Answer:</strong> {question.answer_text}
          </p>
        )}

        {/* Teacher Write / Edit Answer Drawer */}
        {showAnswerBox && (
          <div className="teacher-answer-drawer fade-in" style={{
            marginTop: '12px',
            padding: '14px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px'
          }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Written Explanation / Answer:
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder="Provide a clear, written answer for students to review in their lecture notes..."
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: '0.88rem', marginBottom: '8px' }}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAnswerBox(false)}
              >
                Cancel
              </button>
              <BusyButton busy={submittingAnswer}
                type="button"
                className="btn btn-primary btn-sm"
                disabled={submittingAnswer || !answerInput.trim()}
                onClick={handleSaveAnswer}
              >
                {submittingAnswer ? 'Publishing…' : 'Publish Answer →'}
              </BusyButton>
            </div>
          </div>
        )}

        {/* Metadata Row */}
        <div className="q-card-meta">
          <span className="q-author-time">
            {question.content_type && question.content_type !== 'QUESTION' ? 'Instructor' : 'Anonymous'} {'\u00b7'} {getRelativeTime(question.created_at)}
          </span>

          {question.category && (
            <span className="badge badge-ghost">{question.category}</span>
          )}

          {isAnswered && (
            <span className="badge badge-green">✓ Answered</span>
          )}
        </div>
      </div>

      {/* Teacher Moderation Controls */}
      {isTeacher && (
        <div className="q-card-teacher-controls">
          {!isAnswered && onPin && (
            <BusyButton busy={saving && ['PINNED', 'PENDING'].includes(savingAction)}
              className={`btn btn-sm ${isPinned ? 'btn-ghost' : 'btn-secondary'}`}
              onClick={() => onPin(question)}
              disabled={saving || pinDisabled}
              title={isPinned ? 'Unpin from spotlight' : 'Pin to class spotlight'}
            >
              {isPinned ? 'Unpin' : "Pin"}
            </BusyButton>
          )}

          {onSubmitAnswerText && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowAnswerBox(!showAnswerBox)
                setAnswerInput(question.answer_text || '')
              }}
              title="Provide written explanation"
            >
              {question.answer_text ? "Edit Answer" : "Write Answer"}
            </button>
          )}

          {!isAnswered && onMarkAnswered && (
            <BusyButton busy={saving && savingAction === 'ANSWERED'}
              className="btn btn-secondary btn-sm mark-answered-btn"
              onClick={() => onMarkAnswered(question)}
              disabled={saving}
              title="Mark as answered in class"
            >
              ✓ Answer
            </BusyButton>
          )}

          {onDelete && (
            <BusyButton busy={deleting}
              className="btn btn-ghost btn-sm delete-q-btn"
              onClick={() => onDelete(question)}
              title="Dismiss question"
            >
              ✕
            </BusyButton>
          )}
        </div>
      )}
    </div>
  )
}
