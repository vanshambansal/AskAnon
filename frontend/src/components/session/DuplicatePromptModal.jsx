import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import React from 'react'
import './DuplicatePromptModal.css'

export default function DuplicatePromptModal({
  isOpen,
  matchedQuestion,
  newQuestionText,
  onUpvoteExisting,
  onPostAnyway,
  onClose,
  busy = false
}) {
  if (!isOpen || !matchedQuestion) return null

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="duplicate-prompt-modal card fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="duplicate-modal-close"
          onClick={onClose}
          aria-label="Close"
          disabled={busy}
        >
          ✕
        </button>

        <div className="duplicate-modal-header">
          <span className="duplicate-eyebrow-tag"><Icon name="message" /> SIMILAR QUESTION DETECTED</span>
          <h2 className="duplicate-modal-title">A similar doubt is already active</h2>
          <p className="duplicate-modal-subtitle">
            To avoid cluttering the lecture feed, consider upvoting the existing question so the professor notices it sooner!
          </p>
        </div>

        <div className="duplicate-card-comparison">
          <div className="duplicate-match-box">
            <div className="duplicate-match-header">
              <span className="duplicate-match-label">ACTIVE QUESTION IN THIS ROOM</span>
              <span className="duplicate-upvote-badge">
                <Icon name="upvote" /> {matchedQuestion.upvotes || 0} {matchedQuestion.upvotes === 1 ? 'upvote' : 'upvotes'}
              </span>
            </div>
            <p className="duplicate-match-text">
              "{matchedQuestion.question_text}"
            </p>
          </div>

          <div className="duplicate-your-draft-box">
            <span className="duplicate-draft-label">YOUR DRAFT</span>
            <p className="duplicate-draft-text">"{newQuestionText}"</p>
          </div>
        </div>

        <div className="duplicate-modal-actions">
          <BusyButton busy={busy}
            type="button"
            className="btn btn-primary btn-md duplicate-upvote-btn"
            onClick={() => onUpvoteExisting(matchedQuestion.id)}
          >
            <Icon name="upvote" /> Upvote Existing Question (+1)
          </BusyButton>

          <button
            type="button"
            className="btn btn-ghost btn-sm duplicate-post-anyway-btn"
            disabled={busy}
            onClick={onPostAnyway}
          >
            Post Mine Anyway →
          </button>
        </div>

        <div className="duplicate-modal-footer">
          <button
            type="button"
            className="duplicate-edit-link"
            disabled={busy}
            onClick={onClose}
          >
            ← Cancel & Edit Draft
          </button>
        </div>
      </div>
    </div>
  )
}
