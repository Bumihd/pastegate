import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { apiKeys } from '../../lib/api'
import { Card, Btn, Alert, Badge } from '../../components/ui/Card'
import { Plus, Trash2, Copy, Check, ChevronRight, ChevronDown } from 'lucide-react'

interface ApiKeyRow {
  id: string
  name: string
  is_active: boolean
  created_at: string
  last_used: string | null
  parent_id: string | null
}

export default function ApiKeys() {
  const { t, lang } = useLang()
  const [keys, setKeys]         = useState<ApiKeyRow[]>([])
  const [name, setName]         = useState('')
  const [newKey, setNewKey]     = useState('')
  const [copied, setCopied]     = useState(false)
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showRevoked, setShowRevoked] = useState(false)

  const load = () => {
    apiKeys.list()
      .then(setKeys)
      .catch(() => setError(t('load_failed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await apiKeys.create(name.trim())
      setNewKey(res.key)
      setName('')
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const revoke = async (k: ApiKeyRow, deployCount: number) => {
    const msg = deployCount > 0 ? t('apikeys_confirm_revoke_base') : t('apikeys_confirm_revoke')
    if (!confirm(msg)) return
    try {
      await apiKeys.revoke(k.id)
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })

  const visible    = keys.filter(k => showRevoked || k.is_active)
  const roots      = visible.filter(k => !k.parent_id || !keys.some(p => p.id === k.parent_id))
  const childrenOf = (id: string) => visible.filter(k => k.parent_id === id)
  const activeCount = keys.filter(k => k.is_active && !k.parent_id).length

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('apikeys_h1')}</h1>

      {newKey && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="success">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{t('apikeys_visible_now')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: 12, color: 'var(--text)', background: 'var(--bg-elevated)',
                padding: '8px 10px', borderRadius: 'var(--radius)', wordBreak: 'break-all' }}>
                {newKey}
              </code>
              <Btn variant="ghost" size="sm" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Btn>
            </div>
          </Alert>
        </div>
      )}

      <Card title={t('apikeys_new_key_h2')}>
        <form onSubmit={e => { e.preventDefault(); create() }} style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder={t('apikeys_name_placeholder')} required maxLength={128}
            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              color: 'var(--text)', fontSize: 13 }} />
          <Btn disabled={adding || !name.trim()}>
            <Plus size={14} />{adding ? '…' : t('add')}
          </Btn>
        </form>
        <p style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>{t('apikeys_recommendation')}</p>
      </Card>

      {error && <div style={{ marginTop: 12 }}><Alert>{error}</Alert></div>}

      <Card
        style={{ marginTop: 16 }}
        title={`${t('apikeys_active')} · ${activeCount}`}
        subtitle={t('apikeys_deploy_hint')}
        action={
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showRevoked} onChange={e => setShowRevoked(e.target.checked)} />
            {t('apikeys_show_revoked')}
          </label>
        }>
        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {roots.map(k => {
            const deploys = childrenOf(k.id)
            const activeDeploys = deploys.filter(d => d.is_active).length
            const open = expanded.has(k.id)
            return (
              <div key={k.id} style={{ borderBottom: '1px solid var(--bg-elevated)' }}>
                <KeyLine k={k} t={t} fmtDate={fmtDate}
                  lead={deploys.length > 0
                    ? <button onClick={() => toggle(k.id)} aria-expanded={open}
                        aria-label={t('apikeys_deploy_keys')} style={iconBtn}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    : <span style={{ width: 22 }} />}
                  meta={deploys.length > 0 &&
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {t('apikeys_deploy_keys')}: {activeDeploys}
                    </span>}
                  onRevoke={() => revoke(k, activeDeploys)} />
                {open && deploys.map(d => (
                  <div key={d.id} style={{ paddingLeft: 30 }}>
                    <KeyLine k={d} t={t} fmtDate={fmtDate} lead={<span style={{ width: 22 }} />}
                      onRevoke={() => revoke(d, 0)} small />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function KeyLine({ k, t, fmtDate, lead, meta, onRevoke, small }: {
  k: ApiKeyRow
  t: (key: string) => string
  fmtDate: (iso: string) => string
  lead: React.ReactNode
  meta?: React.ReactNode
  onRevoke: () => void
  small?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
      opacity: k.is_active ? 1 : 0.55 }}>
      {lead}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: small ? 12.5 : 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</span>
          {!k.is_active && <Badge color="var(--sev-low)">{t('apikeys_revoked')}</Badge>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {t('apikeys_created')}: {fmtDate(k.created_at)}
          {' · '}
          {k.last_used ? `${t('apikeys_last_used')}: ${fmtDate(k.last_used)}` : t('apikeys_never_used')}
        </div>
      </div>
      {meta}
      {k.is_active && (
        <button onClick={onRevoke} title={t('apikeys_revoke')} aria-label={t('apikeys_revoke')}
          style={{ ...iconBtn, color: 'var(--sev-critical)' }}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, padding: 0, background: 'none', border: 'none',
  borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer',
}
