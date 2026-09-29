import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { FileText, Download, Clock } from 'lucide-react'
import { audit } from '../../lib/api'
import { Btn } from '../../components/ui/Card'
import { fmtDateTime, fmtNumber } from '../../lib/format'

export default function Privacy() {
  const { t, lang } = useLang()
  const actionLabel = (a: string): string => (({
    login:             t('audit_action_login'),
    resolve_requested: t('audit_action_resolve_requested'),
    resolve_approved:  t('audit_action_resolve_approved'),
    identity_viewed:   t('audit_action_identity_viewed'),
    token_created:     t('audit_action_token_created'),
    token_revoked:     t('audit_action_token_revoked'),
  }) as Record<string, string>)[a] || a
  const [logs, setLogs]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    audit.list()
      .then(setLogs)
      .catch((e: any) => setError(e?.message || t('err_load_failed_generic')))
      .finally(() => setLoading(false))
  }, [])

  // Encode a CSV cell safely: against field/line breaks AND formula injection
  // (Excel/Sheets interpret a leading =,+,-,@ as a formula).
  const csvCell = (v: unknown): string => {
    let s = v == null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return `"${s.replace(/"/g, '""')}"`
  }

  const exportCSV = () => {
    const header = [t('privacy_csv_timestamp'), t('privacy_csv_action'), t('privacy_csv_requester'), t('privacy_csv_approver'), t('privacy_csv_target'), t('privacy_csv_reason')]
      .map(csvCell).join(',') + '\n'
    const rows = logs.map(l =>
      [l.ts, l.action, l.actor_name ?? l.actor_id, l.approver_name ?? l.approver_id, l.target_hash, l.reason].map(csvCell).join(',')
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `pastegate-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={16} color="var(--text-muted)" aria-hidden="true" />
          <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('privacy_h1')}</h1>
        </div>
        <Btn variant="secondary" size="sm" onClick={exportCSV}>
          <Download size={14} />{t('btn_export_csv')}
        </Btn>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '10px 12px',
          background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)', borderRadius: 'var(--radius)',
          fontSize: 12, color: 'var(--sev-critical)' }}>{error}</div>
      )}

      {/* Compliance overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 16 }}>
        {[
          { label: t('privacy_kpi_entries'), value: logs.length },
          { label: t('privacy_kpi_identity_viewed'),
            value: logs.filter(l => l.action === 'identity_viewed').length },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(s.value, lang)}</div>
          </div>
        ))}
      </div>

      {/* Audit-Log */}
      <div style={card}>
        <h2 style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
          {t('privacy_auditlog_title', { n: fmtNumber(logs.length, lang) })}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('privacy_auditlog_desc')}
        </p>

        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.slice(0, 50).map(l => (
            <div key={l.id} style={{ display: 'flex', gap: 12, padding: '10px 12px',
              background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              borderLeft: l.action.includes('resolve') || l.action === 'identity_viewed'
                ? '2px solid var(--sev-high)' : '2px solid var(--border)' }}>
              <div style={{ flexShrink: 0 }}>
                <Clock size={12} color="var(--text-muted)" style={{ marginTop: 2 }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {actionLabel(l.action)}
                  </span>
                  <code style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {fmtDateTime(l.ts, lang, { dateStyle: 'short', timeStyle: 'medium' })}
                  </code>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {t('privacy_actor_label')}: <span style={{ color: 'var(--text)' }}>{l.actor_name ?? l.actor_id}</span>
                </div>
                {l.target_hash && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {t('privacy_hash_label')}: <code>{l.target_hash.slice(0, 16)}…</code>
                    {l.reason && ` · ${t('privacy_reason_label')}: ${l.reason}`}
                  </div>
                )}
                {!l.target_hash && l.reason && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{l.reason}</div>
                )}
                {l.approver_id && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('privacy_approved_by', { name: l.approver_name ?? l.approver_id })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!loading && logs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              {t('privacy_empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: 16,
}
