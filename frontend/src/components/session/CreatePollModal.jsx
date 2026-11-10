import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import React, { useState } from 'react'
import './CreatePollModal.css'

export default function CreatePollModal({ isOpen, onClose, onLaunch, busy = false }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])

  if (!isOpen) return null

  const handleOptionChange = (idx, value) => {
    const updated = [...options]
    updated[idx] = value
    setOptions(updated)
  }

  const addOption = () => {
    if (options.length < 6) {
      setOptions([...options, ''])
    }
  }

  const removeOption = (idx) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx))
    }
  }

  const applyPreset = (presetName) => {
    if (presetName === 'abcd') {
      setOptions(['Option A', 'Option B', 'Option C', 'Option D'])
    } else if (presetName === 'tf') {
      setOptions(['True', 'False'])
    } else if (presetName === 'comfort') {
      setOptions(['Got it completely', 'Need one more example', 'Totally confused'])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanQuestion = question.trim()
    const validOptions = options.map(o => o.trim()).filter(Boolean)
    if (!cleanQuestion || validOptions.length < 2 || busy) return

    try { const launched = await onLaunch({
      question: cleanQuestion,
      options: validOptions
    })
    if (launched) { setQuestion(''); setOptions(['', '']) }
    } catch { /* Keep the poll draft open; the parent displays the error. */ }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="create-poll-modal card fade-up" onClick={(e) => e.stopPropagation()}>
        <button className="poll-modal-close" disabled={busy} onClick={onClose} title="Close" type="button">
          ✕
        </button>

        <div className="poll-modal-header">
          <div className="poll-modal-badge">
            <span className="poll-badge-dot"></span>
            FACULTY REAL-TIME INTERACTION
          </div>
          <h2>Launch Live Class Poll</h2>
          <p className="poll-modal-subtitle">
            Broadcast an instant comprehension check or live vote to every student screen.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="poll-presets-bar">
          <span className="preset-label">Quick Presets:</span>
          <div className="preset-chips">
            <button
              type="button"
              className="preset-chip"
              onClick={() => applyPreset('abcd')}
              title="Add 4 options (A, B, C, D)"
            >
              A / B / C / D
            </button>
            <button
              type="button"
              className="preset-chip"
              onClick={() => applyPreset('tf')}
              title="Add True / False options"
            >
              True / False
            </button>
            <button
              type="button"
              className="preset-chip"
              onClick={() => applyPreset('comfort')}
              title="Confidence check options"
            >
              Grip Level
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="poll-modal-form">
          <div className="poll-form-group">
            <label className="poll-form-label">
              Question / Prompt <span className="required-star">*</span>
            </label>
            <input
              type="text"
              className="poll-input-field"
              placeholder="e.g. What is the average time complexity of quickselect?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="poll-form-group">
            <div className="poll-options-header">
              <label className="poll-form-label">
                Answer Options <span className="poll-options-counter">({options.length}/6)</span>
              </label>
              <span className="poll-options-hint">Min 2, max 6 options</span>
            </div>

            <div className="poll-modal-options-list">
              {options.map((opt, idx) => (
                <div key={idx} className="poll-option-input-row">
                  <span className="poll-option-index-badge">{String.fromCharCode(65 + idx)}</span>
                  <input
                    type="text"
                    className="poll-input-field poll-option-input"
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    required
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="poll-remove-opt-btn"
                      onClick={() => removeOption(idx)}
                      title="Remove this option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                className="add-poll-option-btn"
                onClick={addOption}
              >
                + Add Another Option
              </button>
            )}
          </div>

          <div className="poll-modal-actions">
            <button type="button" disabled={busy} className="poll-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <BusyButton busy={busy}
              type="submit"
              className="poll-btn-submit"
              disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
            >
              {busy ? 'Launching poll…' : <><Icon name="chart" /> Broadcast Poll Live</>}
            </BusyButton>
          </div>
        </form>
      </div>
    </div>
  )
}
