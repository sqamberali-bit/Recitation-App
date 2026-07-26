import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes so a single bad record can never leave the user
 * with a blank screen mid-Majlis — they always get a way back to the library.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="shell center" style={{ paddingTop: 64 }}>
        <div className="empty__icon">⚠️</div>
        <h3>Something went wrong</h3>
        <p className="muted" style={{ margin: '8px auto 20px', maxWidth: 380 }}>
          Your poems are safe on this device. Reloading usually fixes it.
        </p>
        <pre
          style={{
            textAlign: 'left', background: 'var(--surface-2)', padding: 12, borderRadius: 12,
            fontSize: 12, overflow: 'auto', maxWidth: 520, margin: '0 auto 20px', color: 'var(--text-2)',
          }}
        >
          {error.message}
        </pre>
        <button className="btn btn--primary" onClick={() => { window.location.href = '/' }}>
          Back to library
        </button>
      </div>
    )
  }
}
