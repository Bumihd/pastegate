import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { events as eventsApi } from '../../lib/api'
import { BarChart2, TrendingUp, AlertTriangle, Shield, type LucideIcon } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
         BarChart, Bar, Cell, CartesianGrid } from 'recharts'
import { fmtNumber } from '../../lib/format'
import { fmtTrendDate } from '../../lib/format'

// Hex values = design tokens (--sev-*); SVG attributes in Recharts need fixed colors.
const SEV_COLOR: Record<string, string> = {
  critical: '#f0563f', high: '#f5a524', medium: '#3b82f6', low: '#6b7785',
}
const AXIS_TICK = { fontSize: 10, fill: '#8b97a6' }
const TOOLTIP_STYLE = { background: '#12181f', border: '1px solid #232b35', borderRadius: 8, fontSize: 12, color: '#e6edf3' }

export default function RiskMap() {
  const { t, lang } = useLang()
  const sevLabel = (v: string) => { const k = 'sev_' + v; const r = t(k); return r === k ? v : r }
  const num = (v: unknown) => fmtNumber(Number(v), lang)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    eventsApi.stats()
      .then(setStats)
      .catch((e: any) => setError(e?.message || t('err_load_failed_generic')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('loading_short')}</div>
  if (error) return <div role="alert" style={{ color: 'var(--sev-critical)', fontSize: 13 }}>{error}</div>

  const riskScore = Math.min(100, Math.round(
    ((stats?.by_severity?.find((s: any) => s.severity === 'critical')?.count || 0) * 4 +
     (stats?.by_severity?.find((s: any) => s.severity === 'high')?.count    || 0) * 2 +
     (stats?.by_severity?.find((s: any) => s.severity === 'medium')?.count  || 0)) / 10
  ))

  const riskColor = riskScore > 70 ? 'var(--sev-critical)' : riskScore > 40 ? 'var(--sev-high)' : 'var(--text)'
  const riskLabel = riskScore > 70 ? t('risk_level_high') : riskScore > 40 ? t('risk_level_medium') : t('risk_level_low')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <BarChart2 size={16} color="var(--text-muted)" aria-hidden="true" />
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('risk_h1')}</h1>
      </div>

      {/* Risk-Score */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, textAlign: 'center', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('risk_score')}</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: riskColor,
            lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{num(riskScore)}</div>
          <div style={{ fontSize: 12, color: riskColor, marginTop: 6,
            fontWeight: 500 }}>{riskLabel}</div>
        </div>

          <StatCard icon={AlertTriangle} label={t('risk_critical_events')}
            value={stats?.by_severity?.find((s: any) => s.severity === 'critical')?.count || 0}
            fmt={num} />
          <StatCard icon={Shield} label={t('dash_today')}
            value={stats?.blocked_today || 0} fmt={num} />
          <StatCard icon={TrendingUp} label={t('dash_devices')}
            value={stats?.devices || 0} fmt={num} />
      </div>

      {/* Trend */}
      <div style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
          {t('risk_trend_30d')}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={stats?.trend || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#5c6773" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#5c6773" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#232b35" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24}
              tickFormatter={v => fmtTrendDate(v, lang)} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false}
              tickFormatter={num} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#2d3742' }}
              labelFormatter={v => fmtTrendDate(v, lang)} formatter={(v: any) => num(v)} />
            <Area type="monotone" dataKey="count" name={t('col_events')} stroke="#8b97a6"
              strokeWidth={1.5} fill="url(#g)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Severity distribution */}
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
          {t('risk_sev_dist')}
        </h2>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats?.by_severity || []} barSize={40} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#232b35" vertical={false} />
            <XAxis dataKey="severity" tick={{ ...AXIS_TICK, fontSize: 11 }}
              tickLine={false} axisLine={false} tickFormatter={sevLabel} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false}
              tickFormatter={num} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,151,166,0.08)' }}
              labelFormatter={v => sevLabel(String(v))} formatter={(v: any) => num(v)} />
            <Bar dataKey="count" name={t('col_events')} radius={[4, 4, 0, 0]}>
              {(stats?.by_severity || []).map((s: any) => (
                <Cell key={s.severity} fill={SEV_COLOR[s.severity] || '#6b7785'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, fmt }: {
  icon: LucideIcon
  label: string; value: number; fmt: (v: unknown) => string
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</div>
        </div>
        <Icon size={16} color="var(--text-hint)" />
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 16,
}
