import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { devices as devicesApi } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'
import { Alert } from '../../components/ui/Card'
import IdentityReveal, { useIdentities } from '../../components/IdentityReveal'

export default function Devices() {
  const { t, lang } = useLang()
  const ids = useIdentities()
  const [items, setItems]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    devicesApi.list()
      .then(setItems)
      .catch(() => setError(t('load_failed')))
      .finally(() => setLoading(false))
  }, [])

  const cols = ids.allowed ? 5 : 4

  return (
    <div>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>
        {t('devices_h1')}{' '}
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums' }}>({items.length})</span>
      </h1>

      {(error || ids.error) && <div style={{ marginBottom: 12 }}><Alert>{error || ids.error}</Alert></div>}

      {/* Real names for itsec/infosec only – every lookup is logged */}
      <div style={{ marginBottom: 16 }}>
        <Alert type="warning">
          <span style={{ fontWeight: 500 }}>{t('devices_identity_info_title')}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>{t('devices_identity_info_text')}</span>
        </Alert>
      </div>

      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>{t('col_hash')}</th>
              {ids.allowed && <th style={th}>{t('col_identity')}</th>}
              <th style={th}>{t('col_events')}</th>
              <th style={th}>{t('col_first_seen')}</th>
              <th style={th}>{t('col_last_seen')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={cols} style={tdMuted}>{t('loading_short')}</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={cols} style={tdMuted}>{t('devices_empty')}</td></tr>
            )}
            {items.map(d => (
              <tr key={d.id} style={{ borderBottom: rowBorder }}>
                <td style={td}>
                  <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {d.device_hash.slice(0,16)}…
                  </code>
                </td>
                {ids.allowed && (
                  <td style={td}>
                    {d.has_identity
                      ? <IdentityReveal deviceId={d.id} ids={ids} />
                      : <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>{t('devices_identity_none')}</span>}
                  </td>
                )}
                <td style={{ ...td, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {d.event_count}
                </td>
                <td style={td}>
                  <span style={dateCell}>{fmtDateTime(d.first_seen, lang)}</span>
                </td>
                <td style={td}>
                  <span style={dateCell}>{fmtDateTime(d.last_seen, lang)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const rowBorder = '1px solid var(--bg-elevated)'
const tableWrap: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', overflowX: 'auto',
}
const table:   React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
const th:      React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
}
const td:      React.CSSProperties = { padding: '10px 14px', fontSize: 12.5 }
const tdMuted: React.CSSProperties = { padding: 20, color: 'var(--text-muted)', fontSize: 13 }
const dateCell: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
}
