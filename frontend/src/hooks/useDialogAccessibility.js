import { useEffect } from 'react'

// Existing dialogs share these overlays. Keep their keyboard behavior consistent.
const selector = '.modal-backdrop, .materials-drawer-overlay, .lightbox-backdrop'
const controls = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

export default function useDialogAccessibility() {
  useEffect(() => {
    let current = null
    let restoreFocus = document.activeElement
    let lastOutsideFocus = document.activeElement
    let previousOverflow = document.body.style.overflow
    let sequence = 0
    const focusable = () => [...current.querySelectorAll(controls)].filter(el => el.getClientRects().length)
    const scan = () => {
      const overlays = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length)
      const next = overlays.at(-1) || null
      if (next === current) return
      if (!next) {
        current = null
        document.body.style.overflow = previousOverflow
        if (restoreFocus?.isConnected) restoreFocus.focus()
        return
      }
      if (!current) {
        restoreFocus = lastOutsideFocus
        previousOverflow = document.body.style.overflow
      }
      current = next
      const panel = current.matches('.lightbox-backdrop') ? current : current.firstElementChild
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      panel.tabIndex = -1
      const heading = panel.querySelector('h1,h2,h3')
      if (heading) {
        heading.id ||= `dialog-title-${++sequence}`
        panel.setAttribute('aria-labelledby', heading.id)
      } else panel.setAttribute('aria-label', current.matches('.lightbox-backdrop') ? 'Image viewer' : 'Classroom dialog')
      // Associate existing visual labels with their fields, including upload forms.
      panel.querySelectorAll('.form-group').forEach(group => {
        const label = group.querySelector('label')
        const field = group.querySelector('input,select,textarea')
        if (label && field && !label.htmlFor) {
          field.id ||= `dialog-field-${++sequence}`
          label.htmlFor = field.id
        }
      })
      document.body.style.overflow = 'hidden'
      if (!current.contains(document.activeElement)) (focusable()[0] || panel).focus()
    }
    const onFocus = event => { if (!event.target.closest(selector)) lastOutsideFocus = event.target }
    const onKey = event => {
      if (!current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (current.querySelector('[aria-busy="true"]')) return
        current.click()
      } else if (event.key === 'Tab') {
        const items = focusable()
        const first = items[0], last = items.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusin', onFocus)
    window.addEventListener('keydown', onKey, true)
    scan()
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = previousOverflow
    }
  }, [])
}
