import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('AskAnon Error Boundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (this.props.onReset) {
      this.props.onReset()
    } else {
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          textAlign: 'center',
          color: '#0f172a',
          background: 'var(--bg-base, #f8fafc)'
        }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '36px',
            maxWidth: '520px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)'
          }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '16px' }}>⚠️</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
              Something went wrong loading this view
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
              {this.props.fallbackMessage || 'An unexpected error occurred while rendering the classroom components. Your session data is safely saved.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={this.handleReset}
                style={{ padding: '8px 18px' }}
              >
                🔄 Try Again
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { window.location.href = '/dashboard' }}
                style={{ padding: '8px 18px' }}
              >
                ← Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
