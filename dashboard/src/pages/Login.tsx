import { useLang } from '../lib/LangContext'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { LanguageSelect } from '../components/ui/LanguageSelect'
import { Logo } from '../components/ui/Logo'
import { Btn } from '../components/ui/Card'

export default function Login() {
  const { login } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate  = useNavigate()
  const [params]  = useSearchParams()

  const [tab,      setTab]      = useState<'local'|'ldap'>('local')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp,     setTotp]     = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Azure SSO callback – take the token from the URL params.
  // The token is removed from the URL IMMEDIATELY (replaceState) so it does not
  // end up in browser history, Referer headers or server logs.
  useEffect(() => {
    const token = params.get('token')
    if (token) {
      localStorage.setItem('pg_token', token)
      window.history.replaceState({}, '', window.location.pathname)
      navigate('/dashboard', { replace: true })
    }
  }, [params])

  const submitLocal = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await login(username, password, needTotp ? totp : undefined)
      if (res.totp_required) { setNeedTotp(true); return }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || t('login_failed'))
    } finally { setLoading(false) }
  }

  const submitLdap = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/ldap/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json() as any
      if (!res.ok) throw new Error(data.detail || t('login_failed'))
      localStorage.setItem('pg_token', data.access_token)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err?.message || t('login_failed'))
    } finally { setLoading(false) }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '11px 0', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: -1, transition: 'color .15s, border-color .15s',
  })

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ marginBottom: 8 }}>
            <Logo size={20} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('login_title')}
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', overflow: 'hidden',
        }}>
          {/* Tabs */}
          {!needTotp && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <button type="button" aria-pressed={tab === 'local'}
                onClick={() => { setTab('local'); setError('') }}
                style={tabStyle(tab === 'local')}>{t('login_local')}</button>
              <button type="button" aria-pressed={tab === 'ldap'}
                onClick={() => { setTab('ldap'); setError('') }}
                style={tabStyle(tab === 'ldap')}>{t('login_ldap')}</button>
            </div>
          )}

          <div style={{ padding: 24 }}>
            {/* Azure SSO Button */}
            {!needTotp && (
              <a href="/api/v1/auth/azure/login" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 0', marginBottom: 16,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                textDecoration: 'none', fontSize: 13, fontWeight: 500,
                transition: 'border-color .15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M12 1h10v10H12z"/>
                  <path fill="#7fba00" d="M1 12h10v10H1z"/>
                  <path fill="#ffb900" d="M12 12h10v10H12z"/>
                </svg>
                {t('login_azure')}
              </a>
            )}

            <form onSubmit={tab === 'local' ? submitLocal : submitLdap}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!needTotp ? (
                <>
                  <div>
                    <label style={lbl} htmlFor="login-user">
                      {tab === 'ldap' ? t('login_ad_user') : t('login_user')}
                    </label>
                    <input id="login-user" style={inp} value={username} autoComplete="username"
                      onChange={e => setUsername(e.target.value)} autoFocus required />
                  </div>
                  <div>
                    <label style={lbl} htmlFor="login-pass">{t('login_pass')}</label>
                    <input id="login-pass" style={inp} type="password" autoComplete="current-password" value={password}
                      onChange={e => setPassword(e.target.value)} required />
                  </div>
                </>
              ) : (
                <div>
                  <label style={lbl} htmlFor="login-totp">{t('login_totp')}</label>
                  <input id="login-totp" inputMode="numeric" autoComplete="one-time-code" style={{ ...inp, textAlign: 'center',
                    letterSpacing: '0.3em', fontSize: 20 }}
                    value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="000000" maxLength={6} autoFocus required />
                </div>
              )}

              {error && (
                <div role="alert" style={{ fontSize: 12, color: 'var(--sev-critical)', padding: '9px 12px',
                  background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)' }}>{error}</div>
              )}

              <Btn type="submit" disabled={loading} style={{ width: '100%', padding: '10px 0' }}>
                {loading ? t('login_loading')
                  : needTotp ? t('login_btn_totp')
                  : tab === 'ldap' ? t('login_btn_ldap')
                  : t('login_btn')}
              </Btn>
            </form>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, marginTop: 16 }}>
          <LanguageSelect value={lang} onChange={setLang} label={t('lang_label')}
            style={{ padding: '3px 6px', fontSize: 11.5 }} />
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>· Pastegate v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500,
}
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 13,
}
