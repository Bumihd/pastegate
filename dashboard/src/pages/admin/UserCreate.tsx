import { useLang } from '../../lib/LangContext'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { users as usersApi } from '../../lib/api'
import { Card, Btn, Alert } from '../../components/ui/Card'
import type { Role } from '../../types'

const ROLES: Role[] = ['itsec','infosec','admin','management','dataprivacy','viewer']

export default function UserCreate() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<Role>('viewer')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 12) { setError(t('err_pw_min12')); return }
    setLoading(true); setError('')
    try {
      await usersApi.create({ username, email, password, role })
      navigate('/users')
    } catch (e: any) {
      setError(e.message || t('unknown_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('usercreate_h1')}</h1>

      <Card>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field id="uc-username" label={t('form_username')}>
            <input id="uc-username" style={inp} value={username} autoComplete="off"
              onChange={e => setUsername(e.target.value)} required autoFocus />
          </Field>
          <Field id="uc-email" label={t('form_email')}>
            <input id="uc-email" style={inp} type="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field id="uc-password" label={t('form_password')}>
            <input id="uc-password" style={inp} type="password" value={password} autoComplete="new-password"
              onChange={e => setPassword(e.target.value)} required minLength={12} />
          </Field>
          <Field id="uc-role" label={t('form_role')}>
            {/* Role IDs are technical identifiers (as in the backend) – not translated */}
            <select id="uc-role" style={inp} value={role}
              onChange={e => setRole(e.target.value as Role)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          {error && <Alert>{error}</Alert>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {/* native type="button": Btn would be a submit button inside the form */}
            <button type="button" onClick={() => navigate('/users')} style={cancelBtn}>
              {t('btn_cancel')}
            </button>
            <Btn disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
              {loading ? t('usercreate_creating') : t('btn_create')}
            </Btn>
          </div>
        </form>
      </Card>
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)',
        marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: '8px 16px', background: 'transparent', color: 'var(--text)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
}
