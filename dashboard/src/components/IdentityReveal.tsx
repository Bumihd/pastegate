import { useState } from 'react'
import { Eye } from 'lucide-react'
import { devices as devicesApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../lib/LangContext'

// Real device names: itsec/infosec only, fetched on click – every lookup is
// recorded server-side in the audit log. Cached per user so a name is fetched
// (and logged) only once per session.
const cache = new Map<string, string | null>()

export function useIdentities() {
  const { user } = useAuth()
  const [, rerender] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const allowed = user?.role === 'itsec' || user?.role === 'infosec'
  const key = (deviceId: string) => `${user?.username}:${deviceId}`

  const reveal = async (deviceId: string) => {
    setBusy(deviceId)
    setError('')
    try {
      const res = await devicesApi.identity(deviceId)
      cache.set(key(deviceId), res.identity)
      rerender(n => n + 1)
    } catch (e: any) {
      setError(e?.message || '')
    } finally {
      setBusy(null)
    }
  }

  return {
    allowed, busy, error, reveal,
    known: (deviceId: string) => cache.has(key(deviceId)),
    get:   (deviceId: string) => cache.get(key(deviceId)) ?? null,
  }
}

export default function IdentityReveal({ deviceId, ids }: {
  deviceId: string
  ids: ReturnType<typeof useIdentities>
}) {
  const { t } = useLang()
  if (!ids.allowed) return null

  if (ids.known(deviceId)) {
    const identity = ids.get(deviceId)
    return identity
      ? <span style={{ fontSize: 12, color: 'var(--text)' }}>{identity}</span>
      : <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{t('devices_identity_none')}</span>
  }

  return (
    <button type="button" onClick={() => ids.reveal(deviceId)} disabled={ids.busy === deviceId}
      title={t('devices_identity_btn')} aria-label={t('devices_identity_btn')} style={revealBtn}>
      <Eye size={12} aria-hidden="true" />{t('devices_identity_btn')}
    </button>
  )
}

const revealBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px',
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text-muted)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
}
