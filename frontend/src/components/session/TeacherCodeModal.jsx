import React, { useState } from 'react'
import './TeacherCodeModal.css'

const POPULAR_LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'java', label: 'Java' },
  { id: 'sql', label: 'SQL' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'html', label: 'HTML/CSS' }
]

export default function TeacherCodeModal({ isOpen, onClose, onBroadcast, broadcasting }) {
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!code.trim() || broadcasting) return
    onBroadcast({
      title: title.trim() || 'Instructor Code Snippet',
      code: code.trim(),
      language
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="teacher-code-modal card fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="faculty-eyebrow-tag">FACULTY PODIUM BROADCAST</span>
            <h2>Share Code Snippet to Class</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose} disabled={broadcasting}>✕</button>
        </div>

        <p className="teacher-code-desc">
          Broadcast clean, formatted code with 1-click student copy to everyone in the room.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-row-split">
            <div className="form-group flex-2">
              <label>Snippet Description / Title</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Binary Search implementation or Bug fix"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group flex-1">
              <label>Language</label>
              <select
                className="input-field"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {POPULAR_LANGUAGES.map(lang => (
                  <option key={lang.id} value={lang.id}>{lang.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Code Snippet *</label>
            <div className="code-editor-wrapper">
              <textarea
                className="teacher-code-textarea"
                rows={10}
                placeholder={`// Enter or paste your ${language} code here...`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                spellCheck={false}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={broadcasting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!code.trim() || broadcasting}
            >
              {broadcasting ? 'Broadcasting…' : "Broadcast Code to Students"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
