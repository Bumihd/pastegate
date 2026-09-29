import { useLang } from '../../lib/LangContext'
import { useState } from 'react'
import { auth } from '../../lib/api'
import { Card, Btn, Alert } from '../../components/ui/Card'

export default function ChangePassword() {
  const { t } = useLang()
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)
  const [loading,  setLoading]  = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 12)  { setError(t('err_new_pw_min12')); return }
    if (next !== confirm)   { setError(t('pw_mismatch')); return }
    setLoading(true); setError('')
    try {
      await auth.changePassword(current, next)
      setDone(true)
    } catch (e: any) {
      setError(e.message || t('pw_change_failed'))
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { id: 'pw-current', label: t('form_current_pw'), val: current, set: setCurrent, auto: 'current-password' },
    { id: 'pw-new',     label: t('form_new_pw'),     val: next,    set: setNext,    auto: 'new-password' },
    { id: 'pw-confirm', label: t('form_confirm_pw'), val: confirm, set: setConfirm, auto: 'new-password' },
  ]

  return (
    <div style={{ maxWidth: 440 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('pw_h1')}</h1>

      <Card>
        {done ? (
          <Alert type="success">
            <div style={{ fontWeight: 500, marginBottom: 4 }}>{t('pw_success')}</div>
            <div style={{ color: 'var(--text-muted)' }}>{t('pw_next_login_hint')}</div>
          </Alert>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fields.map(f => (
              <div key={f.id}>
                <label htmlFor={f.id} style={labelStyle}>{f.label}</label>
                <input id={f.id} style={inp} type="password" value={f.val} autoComplete={f.auto}
                  onChange={e => f.set(e.target.value)} required />
              </div>
            ))}
            {error && <Alert>{error}</Alert>}
            <Btn disabled={loading} style={{ justifyContent: 'center' }}>
              {loading ? t('pw_saving') : t('pw_title')}
            </Btn>
          </form>
        )}
      </Card>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
