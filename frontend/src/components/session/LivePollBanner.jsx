import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import React from 'react'
import './LivePollBanner.css'

export default function LivePollBanner({
  poll,
  isTeacher,
  myVote,
  onVote,
  onEndPoll,
  onRemovePoll,
  onDismiss,
  busy = false
}) {
  if (!poll) return null

  const totalVotes = poll.totalVotes || poll.options.reduce((sum, opt) => sum + (opt.votes || 0), 0)

  return (
    <div className={`live-poll-banner fade-up ${!poll.active ? 'poll-closed' : ''}`}>
      <div className="poll-banner-header">
        <div className="poll-badge-row">
          <span className={`poll-status-indicator ${poll.active ? 'pulse' : 'closed'}`}>
            {poll.active ? '● LIVE CLASS POLL' : "POLL CONCLUDED"}
          </span>
          <span className="poll-total-votes">
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          </span>
        </div>

        <div className="poll-header-actions">
          {isTeacher && poll.active && (
            <BusyButton busy={busy}
              className="btn btn-secondary btn-xs end-poll-btn"
              onClick={onEndPoll}
              title="Close voting and show final results"
            >
              <Icon name="check" /> End Voting
            </BusyButton>
          )}
          {isTeacher && (
            <BusyButton busy={busy}
              className="btn btn-ghost btn-xs remove-poll-btn"
              onClick={onRemovePoll}
              title="Remove poll from all student screens"
            >
              <Icon name="trash" /> Remove
            </BusyButton>
          )}
          {!isTeacher && !poll.active && (
            <button
              className="poll-dismiss-btn"
              onClick={onDismiss}
              title="Dismiss poll banner"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <h3 className="poll-question-text">{poll.question}</h3>

      <div className="poll-options-grid">
        {poll.options.map((option, idx) => {
          const votes = option.votes || 0
          const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
          const isSelected = myVote === idx
          const canVote = !isTeacher && poll.active && myVote === null

          return (
            <button
              type="button"
              key={idx}
              className={`poll-option-row ${isSelected ? 'is-selected' : ''} ${canVote ? 'is-clickable' : ''}`}
              disabled={!canVote || busy}
              onClick={() => canVote && onVote(idx)}
            >
              {/* Animated Progress Bar Fill */}
              {(myVote !== null || isTeacher || !poll.active) && (
                <div
                  className="poll-progress-fill"
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="poll-option-content">
                <span className="poll-option-key">{String.fromCharCode(65 + idx)}</span>
                <span className="poll-option-label">{option.text}</span>
                {isSelected && <span className="poll-voted-badge">✓ Your vote</span>}
              </div>

              {(myVote !== null || isTeacher || !poll.active) && (
                <div className="poll-option-stats">
                  <span className="poll-percent">{percentage}%</span>
                  <span className="poll-vote-count">({votes})</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {busy && <p role="status"><span className="operation-spinner" aria-hidden="true" />Saving poll update…</p>}

      {poll.active && !isTeacher && myVote === null && (
        <p className="poll-vote-prompt">Click an option to cast your anonymous vote</p>
      )}
    </div>
  )
}
