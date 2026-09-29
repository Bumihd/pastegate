import React, { ReactNode, ErrorInfo } from 'react'
import { browserLang, getStoredLang, makeT, matchLang, type Lang } from '../lib/i18n'
import { Btn } from './ui/Card'

/**
 * The ErrorBoundary sits OUTSIDE the LangProvider (it must also catch its crashes),
 * so it resolves the language itself: explicit choice in this browser → <html lang>
 * set by the LangProvider → browser language.
 */
function currentLang(): Lang {
  return getStoredLang()
    ?? matchLang(document.documentElement.getAttribute('lang'))
    ?? browserLang()
}

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Global ErrorBoundary for the whole app.
 * Prevents a crash in one page component from taking down the entire SPA.
 * Shows a fallback with a reload button instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Production: send to external logging (Sentry etc.) — console only here
    // eslint-disable-next-line no-console
    console.error('Pastegate UI crash:', error, info.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  reload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const t = makeT(currentLang())
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 40, background: 'var(--bg-canvas)',
      }}>
        <div style={{
          maxWidth: 480, padding: 24, background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>
            {t('error_boundary_title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            {t('error_boundary_text')}
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 11, background: 'var(--bg-elevated)', padding: 12,
              borderRadius: 'var(--radius)', marginBottom: 20, overflowX: 'auto',
              color: 'var(--sev-critical)', textAlign: 'left',
            }}>{this.state.error.message}</pre>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Btn variant="secondary" onClick={this.reset}>{t('error_boundary_retry')}</Btn>
            <Btn onClick={this.reload}>{t('error_boundary_reload')}</Btn>
          </div>
        </div>
      </div>
    )
  }
}
