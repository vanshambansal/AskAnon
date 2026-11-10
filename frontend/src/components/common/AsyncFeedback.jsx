export function BusyButton({ busy = false, disabled, children, ...props }) {
  return <button {...props} disabled={disabled || busy} aria-busy={busy || undefined}>
    {busy && <span className="operation-spinner" aria-hidden="true" />}{children}
  </button>
}

export function PageSkeleton({ label = 'Opening your workspace…' }) {
  return <section className="page-skeleton" aria-busy="true" aria-label={label}>
    <p role="status"><span className="operation-spinner" aria-hidden="true" />{label}</p>
    <div className="skeleton-line skeleton-heading" />
    <div className="skeleton-grid">{[0, 1, 2].map(id => <div className="skeleton-card" key={id}><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>)}</div>
  </section>
}
