import Icon from '../common/Icon'
import { BusyButton } from '../common/AsyncFeedback'
import useNow from '../../hooks/useNow'
import React, { useState, useRef } from 'react'
import { downloadFile } from '../../utils/downloadHelper'

export default function MaterialsDrawer({
  isOpen,
  onClose,
  materials = [],
  isTeacher,
  onUploadMaterial,
  onDeleteMaterial,
  uploading
}) {
  const now = useNow()
  const [activeCategory, setActiveCategory] = useState('All')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Lecture Slides')
  const [selectedFile, setSelectedFile] = useState(null)
  const [formError, setFormError] = useState('')
  const fileRef = useRef(null)

  if (!isOpen) return null

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getRelativeTime = (isoString) => {
    if (!isoString) return ''
    const diff = Math.floor((now - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return new Date(isoString).toLocaleDateString()
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSelectedFile(file)
    if (!title.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      setTitle(baseName)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      setFormError('Please select a PDF or slide file')
      return
    }
    if (!title.trim()) {
      setFormError('Please enter a title for the material')
      return
    }
    setFormError('')

    const saved = await onUploadMaterial({
      file: selectedFile,
      title: title.trim(),
      category
    })

    if (!saved) { setFormError('Upload was not completed. Your selection is preserved; retry when ready.'); return }

    // Reset
    setSelectedFile(null)
    setTitle('')
    setShowUploadForm(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const filteredMaterials = activeCategory === 'All'
    ? materials
    : materials.filter(m => m.category === activeCategory)

  const categories = ['All', 'Slides', 'Notes', 'Assignments', 'Problem Sheet', 'Other']

  return (
    <div className="materials-drawer-overlay fade-in" onClick={() => !uploading && onClose()}>
      <div className="materials-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header-row">
          <div className="drawer-header-left">
            <h2 className="drawer-heading">Lecture Materials</h2>
            <span className="drawer-count-badge">{materials.length} files</span>
          </div>
          <button disabled={uploading} className="drawer-close-btn" onClick={onClose} title="Close drawer">
            ✕
          </button>
        </div>

        {/* Category Filter Chips */}
        <div className="drawer-category-chips">
          {categories.map((cat) => {
            const isActive = activeCategory === (cat === 'Slides' ? 'Lecture Slides' : cat)
            return (
              <button
                key={cat}
                className={`drawer-chip ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat === 'Slides' ? 'Lecture Slides' : cat)}
              >
                {cat}
              </button>
            )
          })}
        </div>

        {/* Teacher Upload Action Button */}
        {isTeacher && (
          <div className="drawer-teacher-upload-bar">
            {!showUploadForm ? (
              <button
                className="btn btn-primary btn-sm drawer-upload-cta"
                onClick={() => setShowUploadForm(true)}
              >
                + Upload Material
              </button>
            ) : (
              <form className="drawer-upload-form card fade-up" onSubmit={handleSubmit}>
                <div className="form-title-row">
                  <h4>Upload to Session Vault</h4>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowUploadForm(false)}
                  >
                    Cancel
                  </button>
                </div>

                <input
                  type="text"
                  className="input"
                  placeholder="Material Title (e.g. CPU Scheduling Slides)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />

                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="Lecture Slides">Lecture Slides</option>
                  <option value="Notes">Notes</option>
                  <option value="Assignments">Assignments</option>
                  <option value="Problem Sheet">Problem Sheet</option>
                  <option value="Other">Other</option>
                </select>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                />

                {formError && <p className="form-error-text"><Icon name="alert" /> {formError}</p>}

                <BusyButton busy={uploading}
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading resource…' : 'Save & Share to Class →'}
                </BusyButton>
              </form>
            )}
          </div>
        )}

        {/* Materials List */}
        <div className="drawer-materials-list">
          {filteredMaterials.length === 0 ? (
            <div className="drawer-empty-state">
              <span className="empty-icon"><Icon name="folder" /></span>
              <p>No materials attached under this category yet.</p>
            </div>
          ) : (
            filteredMaterials.map((mat) => (
              <div key={mat.id} className="material-item-card fade-up">
                {/* Red PDF / Document Icon Badge */}
                <div className="material-doc-icon" title={mat.file_type === 'pdf' ? 'PDF document' : 'Image'}>
                  <span className="doc-icon-ext">{mat.file_type === 'pdf' ? 'PDF' : 'IMG'}</span>
                </div>

                <div className="material-item-details">
                  <h4 className="material-item-title">{mat.title}</h4>
                  <span className="material-item-sub">
                    {mat.category || 'Slides'} · {formatFileSize(mat.file_size)} · {getRelativeTime(mat.uploaded_at)}
                  </span>
                </div>

                <div className="material-item-actions">
                  <button
                    className="btn btn-secondary btn-sm download-icon-btn"
                    onClick={() => downloadFile(mat.file_url, `${mat.title || 'Lecture_Material'}.${mat.file_type === 'pdf' ? 'pdf' : 'jpg'}`)}
                    title="Download material directly"
                  >
                    ↓
                  </button>

                  {isTeacher && (
                    <button
                      className="btn btn-ghost btn-sm delete-mat-btn"
                      onClick={() => onDeleteMaterial(mat.id)}
                      title="Delete material from vault"
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
