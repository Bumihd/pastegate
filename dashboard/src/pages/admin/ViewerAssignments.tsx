import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { devices as devicesApi, users as usersApi, viewerAssignments } from '../../lib/api'
import { Plus, Trash2 } from 'lucide-react'
import { fmtDate } from '../../lib/format'
import { Card, Btn, Alert } from '../../components/ui/Card'

export default function ViewerAssignments() {
  const { t, lang } = useLang()
  const [devices,  setDevices]  = useState<any[]>([])
  const [users,    setUsers]    = useState<any[]>([])
  const [assigns,  setAssigns]  = useState<any[]>([])
  const [selUser,  setSelUser]  = useState('')
  const [selDev,   setSelDev]   = useState('')
  const [note,     setNote]     = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const load = async () => {
    try {
      const [d, u, a] = await Promise.all([
        devicesApi.list(),
        usersApi.list(),
        viewerAssignments.list(),
      ])
      setDevices(Array.isArray(d) ? d : [])
      setUsers(Array.isArray(u) ? u.filter((x: any) => x.role === 'viewer') : [])
      setAssigns(Array.isArray(a) ? a : [])
    } catch (e: any) {
      setError(e?.message || t('err_load_failed_generic'))
    }
  }

  useEffect(() => { load() }, [])

  const assign = async () => {
    if (!selUser || !selDev) { setError(t('assign_err_pick_both')); return }
    setLoading(true); setError('')
    try {
      await viewerAssignments.create({ user_id: selUser, device_id: selDev, note })
      setSelUser(''); setSelDev(''); setNote('')
      await load()
    } catch (e: any) {
      setError(e?.message || t('err_load_failed_generic'))
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    try {
      await viewerAssignments.delete(id)
      await load()
    } catch (e: any) {
      setError(e?.message || t('err_load_failed_generic'))
    }
  }

  const getUserName = (id: string) => users.find(u => u.id === id)?.username || id.slice(0,8)
  const getDevHash  = (id: string) => devices.find(d => d.id === id)?.device_hash?.slice(0,16) || id.slice(0,8)

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('assign_title')}</h1>

      <Card title={t('assign_h2_new')}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          {t('assign_info_text')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...sel, flex: 1 }} value={selUser} aria-label={t('assign_pick_user')}
            onChange={e => setSelUser(e.target.value)}>
            <option value="">{t('assign_pick_user')}</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
          </select>
          <select style={{ ...sel, flex: 1 }} value={selDev} aria-label={t('assign_pick_dev')}
            onChange={e => setSelDev(e.target.value)}>
            <option value="">{t('assign_pick_dev')}</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>
                {d.label || d.device_hash.slice(0,16) + '…'} ({t('assign_dev_events', { count: d.event_count })})
              </option>
            ))}
          </select>
          <input style={{ ...sel, flex: 1 }} value={note} aria-label={t('assign_note_placeholder')}
            onChange={e => setNote(e.target.value)}
            placeholder={t('assign_note_placeholder')} />
          <Btn onClick={assign} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            <Plus size={14} />{loading ? '…' : t('btn_save')}
          </Btn>
        </div>
        {error && <div style={{ marginTop: 10 }}><Alert>{error}</Alert></div>}

        {devices.length === 0 && (
          <div style={{ ...notice, marginTop: 12 }}>{t('assign_no_devices')}</div>
        )}
        {users.length === 0 && (
          <div style={{ ...notice, marginTop: 8 }}>{t('assign_no_viewers')}</div>
        )}
      </Card>

      <Card title={`${t('assign_h2_active')} · ${assigns.length}`} style={{ marginTop: 16 }}>
        {assigns.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('assign_empty')}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {assigns.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 8, padding: '10px 0',
              borderBottom: '1px solid var(--bg-elevated)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {getUserName(a.user_id)} →{' '}
                  <code style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {getDevHash(a.device_id)}…
                  </code>
                </div>
                {a.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{a.note}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2,
                  fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDate(a.assigned_at, lang)}
                </div>
              </div>
              <button onClick={() => remove(a.id)} title={t('delete')} aria-label={t('delete')}
                style={{ display: 'inline-flex', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--sev-critical)', padding: 6, borderRadius: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const sel: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
  minWidth: 160,
}
const notice: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px',
  background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
}
