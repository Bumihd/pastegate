import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { accessTokens, type AccessTokenRow } from '../../lib/api'
import { Card, Btn, Alert, Badge } from '../../components/ui/Card'
import { Plus, Trash2, Copy, Check } from 'lucide-react'
import { fmtDateTime } from '../../lib/format'

// Personal tokens for the reporting API (/api/v1/data/*): Grafana, Jira, BI …
// The token inherits the user's role and never returns real names.

const EXPIRY_OPTIONS = [0, 30, 90, 365] as const   // 0 = never expires

export default function ApiAccess() {
  const { t, lang } = useLang()
  const [tokens, setTokens]   = useState<AccessTokenRow[]>([])
  const [name, setName]       = useState('')
  const [expiry, setExpiry]   = useState<number>(0)
  const [newToken, setNewToken] = useState('')
  const [copied, setCopied]   = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [error, setError]     = useState('')

  const load = () => {
    accessTokens.list()
      .then(setTokens)
      .catch(() => setError(t('load_failed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await accessTokens.create(name.trim(), expiry || null)
      setNewToken(res.token)
      setName('')
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const revoke = async (tok: AccessTokenRow) => {
    if (!confirm(t('apiaccess_confirm_revoke', { name: tok.name }))) return
    try {
      await accessTokens.revoke(tok.id)
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(''), 2000)
  }

  const base = `${window.location.origin}/api/v1`
  const example = `curl -H "Authorization: Bearer ${newToken || 'pgr_…'}" \\\n  ${base}/data/stats?days=30`
  const active = tokens.filter(tok => tok.is_active)

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{t('apiaccess_h1')}</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        {t('apiaccess_intro')}{' '}
        <Link to="/api-docs" style={{ color: 'var(--accent)' }}>{t('apiaccess_docs_link')}</Link>
      </p>

      {newToken && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="success">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('apikeys_visible_now')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={codeBox}>{newToken}</code>
              <Btn variant="ghost" size="sm" onClick={() => copy(newToken, 'token')} ariaLabel={t('apiaccess_copy')}>
                {copied === 'token' ? <Check size={14} /> : <Copy size={14} />}
              </Btn>
            </div>
          </Alert>
        </div>
      )}

      <Card title={t('apiaccess_new_h2')}>
        <form onSubmit={e => { e.preventDefault(); create() }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder={t('apiaccess_name_placeholder')} aria-label={t('apiaccess_name_placeholder')}
            required maxLength={128} style={{ ...field, flex: '1 1 220px' }} />
          <select value={expiry} onChange={e => setExpiry(Number(e.target.value))}
            aria-label={t('apiaccess_expiry')} style={field}>
            {EXPIRY_OPTIONS.map(d => (
              <option key={d} value={d}>{d ? t('apiaccess_expiry_days', { n: d }) : t('apiaccess_expiry_never')}</option>
            ))}
          </select>
          <Btn disabled={adding || !name.trim()}>
            <Plus size={14} />{adding ? '…' : t('add')}
          </Btn>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8, lineHeight: 1.6 }}>{t('apiaccess_scope_hint')}</p>
      </Card>

      {error && <div style={{ marginTop: 12 }}><Alert>{error}</Alert></div>}

      <Card style={{ marginTop: 16 }} title={t('apiaccess_example_h2')}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <pre style={{ ...codeBox, margin: 0, whiteSpace: 'pre-wrap' }}>{example}</pre>
          <Btn variant="ghost" size="sm" onClick={() => copy(example, 'example')} ariaLabel={t('apiaccess_copy')}>
            {copied === 'example' ? <Check size={14} /> : <Copy size={14} />}
          </Btn>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8, lineHeight: 1.6 }}>{t('apiaccess_example_hint')}</p>
      </Card>

      <Card style={{ marginTop: 16 }} title={`${t('apiaccess_list_h2')} · ${active.length}`}>
        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}
        {!loading && tokens.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('apiaccess_empty')}</div>
        )}
        {tokens.map(tok => {
          const expired = !!tok.expires_at && new Date(tok.expires_at) <= new Date()
          return (
            <div key={tok.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
              borderBottom: '1px solid var(--bg-elevated)', opacity: tok.is_active && !expired ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tok.name}</span>
                  {!tok.is_active && <Badge color="var(--sev-low)">{t('apikeys_revoked')}</Badge>}
                  {tok.is_active && expired && <Badge color="var(--sev-low)">{t('apiaccess_expired')}</Badge>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {t('apikeys_created')}: {fmtDateTime(tok.created_at, lang)}
                  {' · '}
                  {tok.last_used ? `${t('apikeys_last_used')}: ${fmtDateTime(tok.last_used, lang)}` : t('apikeys_never_used')}
                  {' · '}
                  {tok.expires_at ? `${t('apiaccess_expires')}: ${fmtDateTime(tok.expires_at, lang)}` : t('apiaccess_expiry_never')}
                </div>
              </div>
              {tok.is_active && (
                <button type="button" onClick={() => revoke(tok)} title={t('apikeys_revoke')}
                  aria-label={t('apikeys_revoke')} style={iconBtn}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )
        })}
      </Card>
    </div>
  )
}

const field: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
const codeBox: React.CSSProperties = {
  flex: 1, fontSize: 12, color: 'var(--text)', background: 'var(--bg-elevated)',
  padding: '8px 10px', borderRadius: 'var(--radius)', wordBreak: 'break-all',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, padding: 0, background: 'none', border: 'none',
  borderRadius: 4, color: 'var(--sev-critical)', cursor: 'pointer',
}
