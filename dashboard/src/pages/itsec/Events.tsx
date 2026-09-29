import { useLang } from '../../lib/LangContext'
import { useEffect, useMemo, useState } from 'react'
import { events as eventsApi } from '../../lib/api'
import { useRuleLabel } from '../../lib/rules'
import { ArrowUpDown } from 'lucide-react'
import { fmtDateTime, fmtNumber } from '../../lib/format'
import IdentityReveal, { useIdentities } from '../../components/IdentityReveal'

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)',
}
const ACTION_COLOR: Record<string, string> = {
  blocked: 'var(--sev-high)', blocked_hard: 'var(--sev-critical)', allowed: 'var(--sev-low)',
}

export default function Events() {
  const { t, lang } = useLang()
  const ruleLabel = useRuleLabel()
  const ids = useIdentities()
  // Translated label for enum values; show unknown values as-is instead of the raw key
  const label = (prefix: string, v: string) => { const k = prefix + v; const r = t(k); return r === k ? v : r }
  const [items, setItems]     = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [page, setPage]       = useState(0)
  const [action, setAction]   = useState('')          // server filter
  const [sevFilter, setSev]   = useState('')          // client filter
  const [sortAsc, setSortAsc] = useState(false)       // sort by time
  const limit = 25

  useEffect(() => {
    setLoading(true)
    setError('')
    eventsApi.list({ limit, offset: page * limit, ...(action ? { action } : {}) })
      .then(r => { setItems(r.items); setTotal(r.total) })
      .catch((e: any) => setError(e?.message || t('err_load_failed_generic')))
      .finally(() => setLoading(false))
  }, [page, action])

  // Client-side: severity filter + time sort over the loaded page.
  const view = useMemo(() => {
    let rows = items
    if (sevFilter) rows = rows.filter(ev => ev.findings?.some((f: any) => f.severity === sevFilter))
    rows = [...rows].sort((a, b) => {
      const d = new Date(a.ts).getTime() - new Date(b.ts).getTime()
      return sortAsc ? d : -d
    })
    return rows
  }, [items, sevFilter, sortAsc])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('events_h1')}</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {fmtNumber(total, lang)}</span>
      </div>

      {(error || ids.error) && (
        <div role="alert" style={{ marginBottom: 12, padding: '10px 12px',
          background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)', borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--sev-critical)' }}>{error || ids.error}</div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Select label={t('filter_action')} value={action}
          onChange={v => { setAction(v); setPage(0) }}
          options={[['', t('filter_all')], ['blocked', t('action_blocked')], ['allowed', t('action_allowed')]]} />
        <Select label={t('filter_severity')} value={sevFilter}
          onChange={setSev}
          options={[['', t('filter_all')], ['critical', t('sev_critical')], ['high', t('sev_high')], ['medium', t('sev_medium')], ['low', t('sev_low')]]} />
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>
                  <button type="button" onClick={() => setSortAsc(s => !s)} style={sortBtn}
                    title={t('events_sort_time')} aria-label={t('events_sort_time')}
                    aria-sort={sortAsc ? 'ascending' : 'descending'}>
                    {t('col_timestamp')} <ArrowUpDown size={11} />
                  </button>
                </th>
                <th style={th}>{t('col_device')}</th>
                <th style={th}>{t('col_host')}</th>
                <th style={th}>{t('col_action')}</th>
                <th style={th}>{t('col_rules')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={empty}>{t('loading_short')}</td></tr>}
              {!loading && view.length === 0 && <tr><td colSpan={5} style={empty}>{t('empty_events')}</td></tr>}
              {view.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--bg-elevated)' }}>
                  <td style={td}><code style={{ color: 'var(--text-muted)' }}>
                    {fmtDateTime(ev.ts, lang, { dateStyle: 'short', timeStyle: 'medium' })}
                  </code></td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ color: 'var(--text-muted)' }}>{ev.device_hash.slice(0, 12)}…</code>
                      {ev.device_label && <span style={{ fontSize: 11, color: 'var(--text)' }}>{ev.device_label}</span>}
                      {ev.device_has_identity && <IdentityReveal deviceId={ev.device_id} ids={ids} />}
                    </div>
                  </td>
                  <td style={td}>
                    {ev.host
                      ? <span style={{ fontSize: 12, color: 'var(--text)' }}>{ev.host}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={td}><Chip color={ACTION_COLOR[ev.action] || 'var(--sev-low)'}>{label('action_', ev.action)}</Chip></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {ev.findings.map((f: any, i: number) => (
                        <Chip key={i} color={SEV_COLOR[f.severity] || 'var(--sev-low)'} title={label('sev_', f.severity)}>
                          {ruleLabel(f.rule_id)}
                        </Chip>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > limit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', alignItems: 'center' }}>
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pageBtn}
            title={t('page_prev')} aria-label={t('page_prev')}>←</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('page_x_of_y', { page: page + 1, pages: Math.ceil(total / limit) })}
          </span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= total} style={pageBtn}
            title={t('page_next_page')} aria-label={t('page_next_page')}>→</button>
        </div>
      )}
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding: '6px 10px', fontSize: 12.5, borderRadius: 'var(--radius)', cursor: 'pointer' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
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

const th: React.CSSProperties = {
  padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
}
const td: React.CSSProperties = { padding: '9px 14px', fontSize: 12.5, color: 'var(--text)' }
const empty: React.CSSProperties = { padding: 16, color: 'var(--text-muted)', fontSize: 12.5 }
const sortBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: 0, fontFamily: 'inherit',
}
const pageBtn: React.CSSProperties = {
  padding: '5px 12px', background: 'transparent', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
}
