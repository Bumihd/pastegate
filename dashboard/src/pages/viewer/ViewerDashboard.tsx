import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { viewer } from '../../lib/api'
import { useRuleLabel } from '../../lib/rules'
import { Shield, AlertTriangle, Clock } from 'lucide-react'
import { fmtDateTime, fmtNumber } from '../../lib/format'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)',
}

const chip = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 500,
  padding: '2px 8px', borderRadius: 4, color, flexShrink: 0,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
})

export default function ViewerDashboard() {
  const { t, lang } = useLang()
  const ruleLabel = useRuleLabel()
  // Translated label for enum values; show unknown values as-is instead of the raw key
  const label = (prefix: string, v: string) => { const k = prefix + v; const r = t(k); return r === k ? v : r }
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    viewer.events()
      .then(d => setEvents(d.items || []))
      .catch((e: any) => setError(e?.message || t('err_load_failed_generic')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Shield size={16} color="var(--text-muted)" aria-hidden="true" />
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('viewer_h1')}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        {t('viewer_subtitle')}
      </p>

      {error && (
        <div role="alert" style={{ marginBottom: 16, padding: '10px 12px',
          background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)', borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--sev-critical)' }}>{error}</div>
      )}

      {/* Info-Banner */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 14px', marginBottom: 20,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.6 }}>
        <Shield size={14} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <div>
          <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{t('viewer_intro')}</strong>
          {' '}{t('viewer_info_body')}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12, marginBottom: 20 }}>
        {[
          { label: t('viewer_stat_total'), value: events.length, icon: AlertTriangle },
          { label: t('stat_today'), value: events.filter(e =>
            new Date(e.ts).toDateString() === new Date().toDateString()).length,
            icon: Clock },
          { label: t('action_allowed'), value: events.filter(e => e.action === 'allowed').length,
            icon: Shield },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(s.value, lang)}</div>
              </div>
              <s.icon size={16} color="var(--text-hint)" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      {/* Event list */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
          fontSize: 13, fontWeight: 500 }}>
          {t('viewer_recent')}
        </div>
        {loading && <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}
        {!loading && events.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Shield size={24} color="var(--text-hint)" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden="true" />
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{t('viewer_all_clear')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('viewer_no_events')}
            </div>
          </div>
        )}
        {events.slice(0, 20).map((ev, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px', borderBottom: '1px solid var(--bg-elevated)' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%',
                background: ev.action === 'allowed' ? 'var(--sev-critical)' : 'var(--sev-low)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>
                {ev.findings?.map((f: any) => ruleLabel(f.rule_id)).join(', ') || t('viewer_unknown_rule')}
              </div>
              <code style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
                {fmtDateTime(ev.ts, lang, { dateStyle: 'short', timeStyle: 'medium' })}
              </code>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {ev.findings?.map((f: any, j: number) => (
                <span key={j} style={chip(SEV_COLOR[f.severity] || 'var(--sev-low)')}>
                  {label('sev_', f.severity)}
                </span>
              ))}
            </div>
            <span style={chip(ev.action === 'allowed' ? 'var(--sev-critical)' : 'var(--sev-low)')}>
              {ev.action === 'allowed' ? t('status_ignored') : ev.action === 'blocked_hard' ? t('status_blocked') : t('status_warned')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
