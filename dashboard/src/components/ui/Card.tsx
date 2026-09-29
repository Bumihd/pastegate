import { ReactNode } from 'react'
import { useLang } from '../../lib/LangContext'
import { fmtNumber } from '../../lib/format'

interface CardProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
  style?: React.CSSProperties
  accent?: boolean
}

export function Card({ children, title, subtitle, action, style, accent }: CardProps) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      // DESIGN.md: no colorful/glowing card borders – the border stays neutral.
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      ...style,
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            {title && <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: title || action ? '16px' : '16px' }}>
        {children}
      </div>
    </div>
  )
}

// KPI tile: label on top (12px muted), value 22px/500 tabular, optional sub/trend.
// No colored top border, no green number (value always in --text).
export function StatCard({ label, value, sub }: {
  label: string; value: string | number; color?: string; sub?: string
}) {
  const { lang } = useLang()
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '14px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)',
        fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? fmtNumber(value, lang) : value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// Severity/status chip: small, radius 4, bg color@14%, text in light variant, weight 500.
export function Badge({ children, color = 'var(--accent)', style }: {
  children: ReactNode; color?: string; style?: React.CSSProperties
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 500, letterSpacing: '0.2px',
      color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      ...style,
    }}>{children}</span>
  )
}

// Buttons: primary = green fill (use sparingly). Otherwise outline (transparent + border,
// hover bg-elevated). Weight 500.
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style, type, title, ariaLabel }: {
  children: ReactNode; onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  style?: React.CSSProperties
  type?: 'button' | 'submit'
  title?: string
  ariaLabel?: string
}) {
  const variants = {
    primary:   { background: 'var(--accent)', color: '#06121b', border: '1px solid var(--accent)' },
    secondary: { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)' },
    danger:    { background: 'transparent', color: 'var(--sev-critical)', border: '1px solid color-mix(in srgb, var(--sev-critical) 40%, transparent)' },
    ghost:     { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' },
  }
  const sizes = {
    sm: { padding: '5px 10px', fontSize: 12 },
    md: { padding: '8px 16px', fontSize: 13 },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: 'var(--radius)', fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'all .15s',
      fontFamily: 'inherit',
      ...variants[variant], ...sizes[size], ...style,
    }}>{children}</button>
  )
}

export function Alert({ children, type = 'error' }: {
  children: ReactNode; type?: 'error' | 'success' | 'warning' | 'info'
}) {
  const colors = {
    error:   'var(--sev-critical)',
    success: 'var(--accent)',
    warning: 'var(--sev-high)',
    info:    'var(--sev-medium)',
  }
  const color  = colors[type]
  const bg     = `color-mix(in srgb, ${color} 10%, transparent)`
  const border = `color-mix(in srgb, ${color} 25%, transparent)`
  return (
    <div style={{ padding: '10px 12px', background: bg, border: `1px solid ${border}`,
      borderRadius: 'var(--radius)', fontSize: 12, color, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
