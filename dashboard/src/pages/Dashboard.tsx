import { useLang } from '../lib/LangContext'
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { events } from '../lib/api'
import { useRuleLabel } from '../lib/rules'
import { StatCard } from '../components/ui/Card'
import { fmtDateTime, fmtTrendDate } from '../lib/format'
import type { Lang } from '../lib/i18n'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

// Severity colors = meaning (no green; low is neutral gray).
const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)',
}
const ACTION_COLOR: Record<string, string> = {
  blocked: 'var(--sev-high)', blocked_hard: 'var(--sev-critical)', allowed: 'var(--sev-low)',
}

/** Format a trend date (ISO "YYYY-MM-DD" or legacy "dd.mm") in the active language. */

export default function Dashboard() {
  const { user } = useAuth()
  const { t, lang } = useLang()
  const ruleLabel = useRuleLabel()
  // Translated label for enum values; show unknown values as-is instead of the raw key
  const label = (prefix: string, v: string) => { const k = prefix + v; const r = t(k); return r === k ? v : r }
  const [stats, setStats]     = useState<any>(null)
  const [recent, setRecent]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const canEvents = user?.role === 'itsec' || user?.role === 'infosec' || user?.role === 'admin'

  useEffect(() => {
    const onErr = (e: any) => setError(e?.message || t('err_load_failed_generic'))
    const tasks: Promise<any>[] = [events.stats().then(setStats).catch(onErr)]
    if (canEvents) tasks.push(events.list({ limit: 8 }).then(r => setRecent(r.items)).catch(onErr))
    Promise.all(tasks).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 40 }}>{t('loading_short')}</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('dash_h1')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          {t('dash_welcome')}, {user?.username}
        </p>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 16, padding: '10px 12px',
          background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)', borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--sev-critical)' }}>{error}</div>
      )}

      {/* KPI-Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label={t('dash_total')}   value={stats?.total_events ?? 0} />
        <StatCard label={t('dash_today')}   value={stats?.blocked_today ?? 0} />
        <StatCard label={t('dash_devices')} value={stats?.devices ?? 0} />
        <StatCard label={t('dash_week')}    value={stats?.week_total ?? 0} sub={t('dash_week_sub')} />
      </div>

      {/* Event table as the main area (security roles only) */}
      {canEvents && (
        <Panel title={t('events_h1')} style={{ marginBottom: 16 }} pad={false}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t('col_timestamp')}</th>
                  <th style={thStyle}>{t('col_device')}</th>
                  <th style={thStyle}>{t('col_action')}</th>
                  <th style={thStyle}>{t('col_rules')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 16, fontSize: 12.5, color: 'var(--text-muted)' }}>{t('empty_events')}</td></tr>
                )}
                {recent.map(ev => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid var(--bg-elevated)' }}>
                    <td style={tdStyle}><code style={{ color: 'var(--text-muted)' }}>
                      {fmtDateTime(ev.ts, lang)}
                    </code></td>
                    <td style={tdStyle}><code style={{ color: 'var(--text-muted)' }}>{ev.device_hash.slice(0, 12)}…</code></td>
                    <td style={tdStyle}><Chip color={ACTION_COLOR[ev.action] || 'var(--sev-low)'}>{label('action_', ev.action)}</Chip></td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ev.findings.map((f: any, i: number) => (
                          <Chip key={i} color={SEV_COLOR[f.severity] || 'var(--sev-low)'} title={label('sev_', f.severity)}>{ruleLabel(f.rule_id)}</Chip>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Severity-Breakdown + Top-Rules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        {user?.role !== 'management' && (
          <Panel title={t('dash_severity')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(stats?.by_severity ?? []).length === 0 && (
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t('dash_no_data')}</span>
              )}
              {(stats?.by_severity ?? []).map((s: any) => (
                <div key={s.severity} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Chip color={SEV_COLOR[s.severity] || 'var(--sev-low)'}>{label('sev_', s.severity)}</Chip>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.count.toLocaleString(lang)}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title={t('dash_top_rules')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!stats?.top_rules?.length && (
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t('dash_no_data')}</span>
            )}
            {(stats?.top_rules ?? []).slice(0, 6).map((r: any) => (
              <div key={r.rule_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{ruleLabel(r.rule_id)}</span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{r.count.toLocaleString(lang)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Trend – muted, single series, no neon fill */}
      <Panel title={t('dash_trend')}>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={stats?.trend ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#5c6773" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#5c6773" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232b35" vertical={false} />
            <XAxis dataKey="date" tickFormatter={v => fmtTrendDate(v, lang)} tick={{ fontSize: 10, fill: '#8b97a6' }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: '#8b97a6' }} tickLine={false} axisLine={false} width={32} allowDecimals={false}
              tickFormatter={v => Number(v).toLocaleString(lang)} />
            <Tooltip contentStyle={{ background: '#12181f', border: '1px solid #232b35', borderRadius: 8, fontSize: 12, color: '#e6edf3' }}
              cursor={{ stroke: '#2d3742' }}
              labelFormatter={v => fmtTrendDate(v, lang)}
              formatter={(v: any) => Number(v).toLocaleString(lang)} />
            <Area type="monotone" dataKey="count" name={t('col_events')} stroke="#8b97a6" strokeWidth={1.5} fill="url(#trend)" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  )
}

function Panel({ title, children, style, pad = true }: {
  title: string; children: React.ReactNode; style?: React.CSSProperties; pad?: boolean
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>{title}</div>
      <div style={{ padding: pad ? 16 : 0 }}>{children}</div>
    </div>
  )
}

function Chip({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 500, color,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    }}>{children}</span>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
}
const tdStyle: React.CSSProperties = { padding: '8px 14px', fontSize: 12.5, color: 'var(--text)' }
