import Icon from '../common/Icon'
import useNow from '../../hooks/useNow'
import React from 'react'

export default function PinnedQuestionBanner({
  pinnedQuestion,
  isTeacher,
  onUnpin,
  onMarkAnswered,
  onExpandImage
}) {
  const now = useNow()
  if (!pinnedQuestion) return null

  const getRelativeTime = (isoString) => {
    if (!isoString) return 'Just now'
    const diff = Math.floor((now - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    return `${Math.floor(diff / 3600)} hr ago`
  }

  const hasText = Boolean(pinnedQuestion.question_text?.trim())
  let rawText = pinnedQuestion.question_text || ''
  let isTeacherBroadcast = ['NOTE', 'CODE'].includes(pinnedQuestion.content_type)

  if (rawText.startsWith('👨‍🏫 [Instructor Note]')) {
    isTeacherBroadcast = true
    rawText = rawText.replace('👨‍🏫 [Instructor Note]', '').trim()
    if (rawText.startsWith(':')) rawText = rawText.substring(1).trim()
  } else if (rawText.startsWith('👨‍🏫 [Instructor Code]')) {
    isTeacherBroadcast = true
    rawText = rawText.replace('👨‍🏫 [Instructor Code]', '').trim()
    if (rawText.startsWith(':')) rawText = rawText.substring(1).trim()
  } else if (rawText.startsWith('👨‍🏫')) {
    isTeacherBroadcast = true
    rawText = rawText.replace('👨‍🏫', '').trim()
  }

  const authorLabel = isTeacherBroadcast ? 'Instructor' : 'Anonymous'
  const timeLabel = getRelativeTime(pinnedQuestion.pinned_at || pinnedQuestion.created_at)

  return (
    <div className="pinned-spotlight card fade-in">
      {/* Top Header: Left badge, Right upvotes */}
      <div className="spotlight-header-row">
        <span className="spotlight-tag">
          {isTeacherBroadcast ? "PROFESSOR BROADCAST" : "SPOTLIGHT DOUBT"}
        </span>
        {!isTeacherBroadcast && (
          <span className="spotlight-upvotes">▲ {pinnedQuestion.upvotes || 0}</span>
        )}
      </div>

      {/* Main Doubt / Note Body */}
      <div className="spotlight-body">
        {hasText ? (
          <h3 className="spotlight-question-title">{rawText}</h3>
        ) : (
          <span className="spotlight-attachment-only">
            {pinnedQuestion.code_snippet ? '</> Code Attachment' : "Diagram Attachment"}
          </span>
        )}

        {/* Professor Answer */}
        {pinnedQuestion.answer_text?.trim() && (
          <p className="spotlight-inline-answer">
            <strong><Icon name="user" /> Professor's Answer:</strong> {pinnedQuestion.answer_text}
          </p>
        )}

        <div className="spotlight-meta-sub">
          {authorLabel} · {timeLabel}
        </div>

        {/* Code Snippet in Spotlight if present */}
        {pinnedQuestion.code_snippet && (
          <div className="q-code-snippet-container" style={{ marginTop: '12px' }}>
            <div className="q-code-header">
              <div className="q-code-lang-tag">
                <span className="code-lang-icon">&lt;/&gt;</span>
                <span className="code-lang-name">{(pinnedQuestion.code_language || 'code').toUpperCase()}</span>
              </div>
            </div>
            <pre className="q-code-pre">
              <code>{pinnedQuestion.code_snippet}</code>
            </pre>
          </div>
        )}

        {/* Attached Image if present */}
        {pinnedQuestion.image_url && (
          <div className="spotlight-image-box" style={{ marginTop: '12px' }}>
            <img
              src={pinnedQuestion.image_url}
              alt="Spotlight attachment"
              className="pinned-image"
              onClick={() => onExpandImage(pinnedQuestion.image_url)}
              title="Click to enlarge"
            />
          </div>
        )}
      </div>

      {/* Teacher Actions Footer */}
      {isTeacher && (
        <div className="spotlight-teacher-bar">
          <button
            className="btn btn-success btn-sm"
            onClick={() => onMarkAnswered(pinnedQuestion)}
            title="Mark answered"
          >
            ✓ Done Answering
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onUnpin(pinnedQuestion)}
            title="Unpin question"
          >
            ✕ Unpin
          </button>
        </div>
      )}
    </div>
  )
}
