import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
import React from 'react'

const CODE_LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML / CSS' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'text', label: 'Plain Text' }
]

export default function QuestionInput({
  questionText,
  onChangeText,
  codeSnippet = '',
  onChangeCodeSnippet,
  codeLanguage = 'python',
  onChangeCodeLanguage,
  showCodeEditor = false,
  onToggleCodeEditor,
  onSubmit,
  posting,
  checkingDuplicate = false,
  uploadingImage,
  cooldown,
  error,
  selectedImage,
  imagePreview,
  onSelectImage,
  onRemoveImage,
  fileInputRef
}) {
  const hasContent = questionText.trim().length > 0 || codeSnippet.trim().length > 0 || Boolean(selectedImage)
  const isSubmittable = hasContent && !posting && !checkingDuplicate && !uploadingImage && cooldown === 0

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isSubmittable) onSubmit()
    }
  }

  return (
    <div className="composer-dock-container fade-up">
      <div className="composer-card">
        {/* Main Textarea */}
        <textarea
          className="composer-textarea"
          placeholder="What's confusing you? Add text, code, or an image... (Press Enter to post)"
          value={questionText}
          onChange={(e) => onChangeText(e.target.value)}
          rows={2}
          maxLength={300}
          onKeyDown={handleKeyDown}
        />

        {/* Selected Image Thumbnail Preview */}
        {imagePreview && (
          <div className="composer-image-preview fade-in">
            <img src={imagePreview} alt="Attached diagram" className="composer-thumb" />
            <div className="composer-image-info">
              <span className="composer-image-name">{selectedImage?.name}</span>
              <small>Automated moderation checks written text, not image contents.</small>
              <button
                type="button"
                className="btn btn-ghost btn-sm remove-img-btn"
                onClick={onRemoveImage}
              >
                ✕ Remove
              </button>
            </div>
          </div>
        )}

        {/* Optional Code Snippet Editor Box */}
        {(showCodeEditor || codeSnippet.trim().length > 0) && (
          <div className="composer-code-box fade-in">
            <div className="composer-code-header">
              <div className="code-header-left">
                <span className="code-terminal-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </span>
                <span className="code-header-title">&lt;/&gt; Code Snippet</span>
                <select
                  className="code-lang-selector"
                  value={codeLanguage}
                  onChange={(e) => onChangeCodeLanguage?.(e.target.value)}
                >
                  {CODE_LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="code-remove-btn"
                onClick={() => {
                  onChangeCodeSnippet?.('')
                  onToggleCodeEditor?.(false)
                }}
                title="Discard code snippet"
              >
                ✕ Discard Code
              </button>
            </div>
            <textarea
              className="composer-code-textarea"
              placeholder="// Paste or type code snippet here..."
              value={codeSnippet}
              onChange={(e) => onChangeCodeSnippet?.(e.target.value)}
              rows={4}
              spellCheck={false}
            />
          </div>
        )}

        {/* Error notification (only for actual errors or policy penalties, not redundant cooldowns) */}
        {error && !error.toLowerCase().includes('please wait') && (
          <div className="composer-error-alert fade-in">
            <span><Icon name="alert" /></span> {error}
          </div>
        )}

        {/* Action Toolbar */}
        <div className="composer-toolbar">
          <div className="toolbar-left">
            <button
              type="button"
              className={`toolbar-attach-btn ${selectedImage ? 'has-file' : ''}`}
              title="Attach an image or diagram"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="attach-icon"><Icon name="image" /></span>
              <span className="attach-label">{selectedImage ? 'Image Attached' : 'Attach Image'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onSelectImage}
            />

            {/* In-Class Code Snippet Button */}
            <button
              type="button"
              className={`toolbar-attach-btn ${codeSnippet.trim() ? 'has-file' : ''}`}
              title="Add a code snippet to your question"
              onClick={() => onToggleCodeEditor?.(!showCodeEditor)}
            >
              <span className="attach-icon">&lt;/&gt;</span>
              <span className="attach-label">
                {codeSnippet.trim() ? `Code (${codeLanguage.toUpperCase()})` : 'Add Code'}
              </span>
            </button>

            {cooldown > 0 ? (
              <span className="cooldown-notice">
                <Icon name="clock" /> Wait {cooldown}s before next question
              </span>
            ) : (
              <span className="composer-privacy-hint">
                <Icon name="shield" /> Your name is hidden from the class
              </span>
            )}
          </div>

          <div className="toolbar-right">
            <span className="composer-char-count">{questionText.length}/300</span>
            <BusyButton busy={uploadingImage || checkingDuplicate || posting}
              className="btn btn-primary composer-submit-btn"
              onClick={onSubmit}
              disabled={!isSubmittable}
            >
              {uploadingImage ? 'Uploading Image…' : checkingDuplicate ? 'Checking duplicates…' : posting ? 'Posting…' : 'Ask Anonymously →'}
            </BusyButton>
          </div>
        </div>
      </div>
    </div>
  )
}
