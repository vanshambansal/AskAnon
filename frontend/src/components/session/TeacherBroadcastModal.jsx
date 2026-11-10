import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import React, { useState } from 'react'
import './TeacherBroadcastModal.css'

const LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'sql', label: 'SQL' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'html', label: 'HTML/CSS' }
]

export default function TeacherBroadcastModal({ isOpen, onClose, onBroadcast, broadcasting }) {
  const [broadcastType, setBroadcastType] = useState('note') // 'note' | 'code'
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (broadcasting) return

    if (broadcastType === 'note') {
      if (!message.trim()) return
      onBroadcast({
        type: 'note',
        title: title.trim() || 'Instructor Answer / Note',
        message: message.trim()
      })
    } else {
      if (!code.trim()) return
      onBroadcast({
        type: 'code',
        title: title.trim() || 'Instructor Code Snippet',
        code: code.trim(),
        language,
        message: message.trim()
      })
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !broadcasting && onClose()}>
      <div className="teacher-broadcast-modal card fade-up" onClick={(e) => e.stopPropagation()}>
        <button className="broadcast-modal-close" onClick={onClose} disabled={broadcasting}>✕</button>

        <div className="broadcast-modal-header">
          <span className="faculty-eyebrow-tag">FACULTY PODIUM BROADCAST</span>
          <h2>Broadcast to Classroom</h2>
          <p className="broadcast-modal-subtitle">
            Instantly spotlight an answer, concept explanation, or code snippet on all student screens.
          </p>
        </div>

        {/* Type Toggle Tabs */}
        <div className="broadcast-type-tabs">
          <button
            type="button"
            className={`broadcast-type-tab ${broadcastType === 'note' ? 'active' : ''}`}
            onClick={() => setBroadcastType('note')}
          >
            <Icon name="book" /> Answer / Concept Note
          </button>
          <button
            type="button"
            className={`broadcast-type-tab ${broadcastType === 'code' ? 'active' : ''}`}
            onClick={() => setBroadcastType('code')}
          >
            <Icon name="code" /> Code Snippet
          </button>
        </div>

        <form onSubmit={handleSubmit} className="broadcast-form">
          <div className="form-group">
            <label>Topic / Title (Optional)</label>
            <input
              type="text"
              className="broadcast-input"
              placeholder={broadcastType === 'note' ? 'e.g. Clarification on Virtual Memory Paging' : 'e.g. Binary Search Recursive Implementation'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {broadcastType === 'note' ? (
            <div className="form-group">
              <label>Message / Answer *</label>
              <textarea
                className="broadcast-textarea"
                rows={5}
                placeholder="Type your explanation, topic answer, or classroom announcement here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Programming Language</label>
                <select
                  className="broadcast-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.id} value={lang.id}>{lang.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Code Snippet *</label>
                <div className="broadcast-code-wrapper">
                  <textarea
                    className="broadcast-code-textarea"
                    rows={8}
                    placeholder={`// Paste or write your ${language} code here...`}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    spellCheck={false}
                  />
                </div>
              </div>
            </>
          )}

          <div className="broadcast-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={broadcasting}
            >
              Cancel
            </button>
            <BusyButton busy={broadcasting}
              type="submit"
              className="btn btn-primary broadcast-submit-btn"
              disabled={broadcasting || (broadcastType === 'note' ? !message.trim() : !code.trim())}
            >
              {broadcasting ? 'Broadcasting…' : "Send to Class"}
            </BusyButton>
          </div>
        </form>
      </div>
    </div>
  )
}
