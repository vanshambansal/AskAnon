import { BusyButton } from '../common/AsyncFeedback'
import Icon from '../common/Icon'
import React from 'react'
import { downloadFile } from '../../utils/downloadHelper'

export default function MediaStrip({
  sessionMedia,
  isTeacher,
  onDeleteMedia,
  onSaveToVault,
  onExpandImage,
  pendingActions = new Set()
}) {
  if (!sessionMedia || sessionMedia.length === 0) return null

  return (
    <div className="media-strip card fade-in">
      <div className="media-strip-header">
        <div className="media-header-left">
          <h3><Icon name="image" /> In-Class Whiteboard & Diagrams</h3>
          <span className="badge badge-amber">
            {sessionMedia.length} {sessionMedia.length === 1 ? 'diagram' : 'diagrams'}
          </span>
        </div>
        <span className="media-strip-hint">Click to enlarge or download</span>
      </div>

      <div className="media-grid">
        {sessionMedia.map((m) => (
          <div key={m.id || m.public_id} className="media-item">
            <div className="media-thumb-container" onClick={() => onExpandImage(m)}>
              <img
                src={m.image_url}
                alt={m.caption || 'Shared diagram'}
                className="media-thumb"
                title="Click to inspect full size"
              />
              <div className="media-thumb-overlay">
                <span><Icon name="search" /> Enlarge</span>
              </div>
            </div>

            {m.caption && <p className="media-caption">{m.caption}</p>}

            <div className="media-item-actions-row">
              {/* 1-Click Download for all users */}
              <button
                className="media-mini-action-btn download"
                onClick={(e) => {
                  e.stopPropagation()
                  downloadFile(m.image_url, `${m.caption || 'whiteboard-diagram'}.jpg`)
                }}
                title="Download this diagram"
              >
                <Icon name="download" /> Download
              </button>

              {/* Teacher Save to Vault */}
              {isTeacher && onSaveToVault && (
                <BusyButton busy={pendingActions.has(`save-media:${m.id}`)}
                  className="media-mini-action-btn vault"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSaveToVault(m)
                  }}
                  title="Save to Course Study Vault permanently"
                >
                  <Icon name="folder" /> Vault
                </BusyButton>
              )}

              {/* Teacher Delete from Screen */}
              {isTeacher && (
                <BusyButton busy={pendingActions.has(`delete-media:${m.id}`)}
                  className="media-mini-action-btn delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteMedia(m)
                  }}
                  title="Remove this image from class screen"
                >
                  <Icon name="trash" />
                </BusyButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
