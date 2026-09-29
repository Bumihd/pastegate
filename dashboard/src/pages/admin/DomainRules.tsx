import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { domainRules } from '../../lib/api'
import { Plus, Trash2 } from 'lucide-react'
import { Card, Btn, Alert, Badge } from '../../components/ui/Card'
import type { DomainRule, DomainMode } from '../../types'

const MODE_LABEL_KEY: Record<DomainMode, string> = {
  warn:       'domain_mode_short_warn',
  hard_block: 'domain_mode_short_hard',
  allow:      'domain_mode_short_allow',
}
// Color = meaning: hard block → critical, warning → high, allowed → neutral
const MODE_COLOR: Record<DomainMode, string> = {
  warn:       'var(--sev-high)',
  hard_block: 'var(--sev-critical)',
  allow:      'var(--sev-low)',
}

export default function DomainRules() {
  const { t } = useLang()
  const [rules, setRules]     = useState<DomainRule[]>([])
  const [pattern, setPattern] = useState('')
  const [mode, setMode]       = useState<DomainMode>('warn')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [adding, setAdding]   = useState(false)

  const load = () => {
    domainRules.list()
      .then(r => setRules(r.filter((x: any) => x.is_active)))
      .catch(() => setError(t('load_failed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pattern.trim()) return
    setAdding(true)
    setError('')
    try {
      await domainRules.create(pattern.trim(), mode)
      setPattern('')
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await domainRules.delete(id)
      setRules(r => r.filter(x => x.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('domain_h1')}</h1>

      {/* New rule */}
      <Card title={t('domain_new')}>
        <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="domain-pattern" style={labelStyle}>{t('col_pattern')}</label>
            <input id="domain-pattern" style={inputStyle} value={pattern}
              onChange={e => setPattern(e.target.value)}
              placeholder={t('domain_pattern_placeholder')} required />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="domain-mode" style={labelStyle}>{t('col_mode')}</label>
            <select id="domain-mode" style={inputStyle} value={mode}
              onChange={e => setMode(e.target.value as DomainMode)}>
              <option value="warn">{t('domain_mode_warn')}</option>
              <option value="hard_block">{t('domain_mode_hard')}</option>
              <option value="allow">{t('domain_mode_allow')}</option>
            </select>
          </div>
          <Btn disabled={adding} style={{ whiteSpace: 'nowrap' }}>
            <Plus size={14} />
            {adding ? '…' : t('add')}
          </Btn>
        </form>

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-hint)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{t('domain_mode_short_warn')}</span> – {t('domain_explain_warn')}{' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{t('domain_mode_short_hard')}</span> – {t('domain_explain_hard')}{' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{t('domain_mode_short_allow')}</span> – {t('domain_explain_allow')}{' '}
          {t('domain_wildcards')} <code style={{ color: 'var(--text-muted)' }}>*.example.com</code>
        </div>
      </Card>

      {error && <div style={{ marginTop: 12 }}><Alert>{error}</Alert></div>}

      {/* Rule list */}
      <Card title={`${t('domain_active')} · ${rules.length}`} style={{ marginTop: 16 }}>
        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}
        {!loading && rules.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('domain_no_rules')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rules.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid var(--bg-elevated)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Badge color={MODE_COLOR[r.mode]}>{t(MODE_LABEL_KEY[r.mode])}</Badge>
                <code style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-all' }}>{r.pattern}</code>
              </div>
              <button onClick={() => remove(r.id)} title={t('delete')} aria-label={t('delete')} style={{
                display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--sev-critical)', padding: 4, borderRadius: 4,
              }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
