import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { users as usersApi } from '../../lib/api'
import { Plus, KeyRound, Shield, UserX } from 'lucide-react'
import { Card, Btn, Alert, Badge } from '../../components/ui/Card'

// Color = permission scope (no green outside brand/primary action)
const ROLE_COLOR: Record<string, string> = {
  itsec: 'var(--sev-critical)', infosec: 'var(--sev-critical)', admin: 'var(--sev-high)',
  management: 'var(--sev-medium)', dataprivacy: 'var(--sev-medium)', viewer: 'var(--sev-low)',
}

export default function Users() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [users, setUsers]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = () => {
    usersApi.list()
      .then(setUsers)
      .catch(() => setError(t('load_failed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const deactivate = async (id: string, username: string) => {
    if (!confirm(t('users_confirm_disable', { name: username }))) return
    try {
      await usersApi.deactivate(id)
      load()
    } catch (e: any) {
      setError(e?.message || t('load_failed'))
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('users_h1')}</h1>
        <Btn size="sm" onClick={() => navigate('/users/new')}>
          <Plus size={14} /> {t('users_create')}
        </Btn>
      </div>

      {error && <div style={{ marginBottom: 12 }}><Alert>{error}</Alert></div>}

      <Card>
        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 8, padding: '10px 0',
              borderBottom: '1px solid var(--bg-elevated)', flexWrap: 'wrap',
              opacity: u.is_active ? 1 : 0.55 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.username}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{u.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {u.totp_enabled && <Badge color="var(--sev-low)">{t('users_badge_2fa')}</Badge>}
                <Badge color={ROLE_COLOR[u.role] || 'var(--sev-low)'}>{u.role}</Badge>
                <button onClick={() => navigate('/change-password')}
                  title={t('users_change_password')} aria-label={t('users_change_password')}
                  style={iconBtn}><KeyRound size={13} /></button>
                <button onClick={() => navigate('/2fa')}
                  title={t('nav_2fa')} aria-label={t('nav_2fa')}
                  style={iconBtn}><Shield size={13} /></button>
                {u.is_active && (
                  <button onClick={() => deactivate(u.id, u.username)}
                    title={t('btn_deactivate')} aria-label={t('btn_deactivate')}
                    style={{ ...iconBtn, color: 'var(--sev-critical)' }}><UserX size={13} /></button>
                )}
              </div>
            </div>
          ))}
          {!loading && users.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('status_no_users')}</div>
          )}
        </div>
      </Card>

      {/* Role overview */}
      <Card title={t('users_roles')} style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {[
            { role: 'itsec / infosec', desc: t('role_itsec_desc') },
            { role: 'admin', desc: t('role_admin_desc') },
            { role: 'management', desc: t('role_management_desc') },
            { role: 'dataprivacy', desc: t('role_dataprivacy_desc') },
            { role: 'viewer', desc: t('role_viewer_desc') },
          ].map(r => (
            <div key={r.role} style={{ padding: '8px 10px', background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <Badge color={ROLE_COLOR[r.role.split(' ')[0]] || 'var(--sev-low)'}>{r.role}</Badge>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-muted)', padding: 4, borderRadius: 4,
}
