import Icon from '../common/Icon'
import { createPortal } from 'react-dom'
import './LightboxModal.css'
import React, { useState, useEffect } from 'react'
import { downloadFile } from '../../utils/downloadHelper'

export default function LightboxModal(props) {
  const target = props.image || props.imageUrl
  const url = typeof target === 'string' ? target : target?.image_url || target?.url || ''
  return target ? <LightboxContent key={url} {...props} /> : null
}

function LightboxContent({
  image, // string URL or object { url, image_url, caption, title, public_id, id }
  imageUrl, // fallback prop name
  onClose,
  isTeacher,
  onSaveToVault
}) {
  const target = image || imageUrl
  const url = typeof target === 'string' ? target : target?.image_url || target?.url || ''
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth - 32, height: window.innerHeight - 180 })
  const [failed, setFailed] = useState(false)
  const stageRef = React.useRef(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }))
    if (stageRef.current) observer.observe(stageRef.current)
    return () => observer.disconnect()
  }, [])
  const fit = natural ? Math.min(viewport.width / natural.width, viewport.height / natural.height, 1) : 1

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!target) return null

  const caption = typeof target === 'object' ? target.caption || target.title : ''

  const handleZoomIn = (e) => {
    e.stopPropagation()
    setZoom((prev) => Math.min(prev + 0.3, 3))
  }

  const handleZoomOut = (e) => {
    e.stopPropagation()
    setZoom((prev) => Math.max(prev - 0.3, 0.6))
  }

  const handleResetZoom = (e) => {
    e.stopPropagation()
    setZoom(1)
  }

  const handleDownload = (e) => {
    e.stopPropagation()
    const filename = caption ? `${caption.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg` : 'shared-image.jpg'
    downloadFile(url, filename)
  }

  return createPortal(
    <div className="lightbox-backdrop fade-in" onClick={onClose}>
      {/* Top Toolbar */}
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-caption-box">
          {caption ? (
            <span className="lightbox-caption-text">{caption}</span>
          ) : (
            <span className="lightbox-caption-text">Attached In-Class Diagram</span>
          )}
        </div>

        <div className="lightbox-tools">
          {/* Zoom controls */}
          <button className="lightbox-tool-btn" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
            −
          </button>
          <button className="lightbox-tool-btn zoom-level" onClick={handleResetZoom} title="Reset zoom" aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button className="lightbox-tool-btn" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
            +
          </button>

          {/* Download button */}
          <button className="lightbox-tool-btn download-btn" onClick={handleDownload} title="Download image to device">
            <Icon name="download" /> Download
          </button>

          {/* Teacher save to vault */}
          {isTeacher && onSaveToVault && (
            <button
              className="lightbox-tool-btn vault-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSaveToVault(target)
              }}
              title="Save diagram to Course Study Vault"
            >
              <Icon name="folder" /> Save to Vault
            </button>
          )}

          {/* Close button */}
          <button className="lightbox-close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close image viewer">
            ✕
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div className="lightbox-stage" ref={stageRef} onClick={onClose}><div className="lightbox-image-wrap">{failed ? <div className="lightbox-error" onClick={event => event.stopPropagation()}><p>The image could not be loaded.</p><button className="lightbox-tool-btn" onClick={() => setFailed(false)}>Retry image</button></div> :
        <img
          src={url}
          alt={caption || 'Shared class media'}
          className="lightbox-main-img"
          style={natural ? { width: natural.width * fit * zoom, height: natural.height * fit * zoom } : undefined}
          onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailed(true)}
          onClick={(e) => e.stopPropagation()}
        />}</div>
      </div>

      <div className="lightbox-footer">
        <span>Click outside or press <strong>Esc</strong> to close</span>
      </div>
    </div>, document.body
  )
}
