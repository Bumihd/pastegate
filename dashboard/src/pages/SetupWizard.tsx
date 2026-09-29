import { useState } from 'react'
import { Logo } from '../components/ui/Logo'
import { ShieldCheck, Check, Copy, KeyRound, UserCog, Languages, ArrowRight } from 'lucide-react'
import { useLang } from '../lib/LangContext'
import { setupApi } from '../lib/api'
import { QrCode } from '../components/ui/QrCode'
import { Btn } from '../components/ui/Card'
import { LanguageSelect } from '../components/ui/LanguageSelect'

type Step = 'token' | 'admin' | 'totp' | 'apikey' | 'settings' | 'done'
const ORDER: Step[] = ['token', 'admin', 'totp', 'apikey', 'settings']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block',
}
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.6,
}
const fullBtn: React.CSSProperties = { width: '100%', padding: '10px 0' }
const copyBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
}

export default function SetupWizard() {
  const { t, lang, setLang } = useLang()
  const [step, setStep]       = useState<Step>('token')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  // Step-State
  const [token, setToken]       = useState('')
  const [username, setUsername] = useState('admin')
  const [email, setEmail]       = useState('')
  const [pw, setPw]             = useState('')
  const [pw2, setPw2]           = useState('')

  const [totpSecret, setTotpSecret] = useState('')
  const [totpQr, setTotpQr]         = useState('')
  const [totpCode, setTotpCode]     = useState('')
  const [totpStarted, setTotpStarted] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [copied, setCopied] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setLoading(true); setError('')
    try { await fn() } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }

  // ── Step-Handler ────────────────────────────────────────────────
  const submitToken = () => run(async () => {
    const r = await setupApi.verifyToken(token.trim())
    if (!r.valid) throw new Error(t('setup_err_token'))
    // If an admin already exists (aborted run): skip the admin step.
    setStep(r.has_admin ? 'totp' : 'admin')
  })

  const submitAdmin = () => run(async () => {
    if (pw.length < 12) throw new Error(t('setup_err_pw_len'))
    if (pw !== pw2)     throw new Error(t('setup_err_pw_match'))
    await setupApi.createAdmin(token.trim(), username.trim(), email.trim(), pw)
    setStep('totp')
  })

  const startTotp = () => run(async () => {
    const r = await setupApi.initTotp(token.trim())
    setTotpSecret(r.secret); setTotpQr(r.qr_image); setTotpStarted(true)
  })

  const confirmTotp = () => run(async () => {
    await setupApi.confirmTotp(token.trim(), totpCode.trim())
    setStep('apikey')
  })

  const genApiKey = () => run(async () => {
    const r = await setupApi.initApiKey(token.trim(), t('setup_apikey_default_name'))
    setApiKey(r.key)
  })

  const finish = () => run(async () => {
    // Save the chosen language as the organization default (dashboard + extensions)
    await setupApi.settings(token.trim(), lang)
    await setupApi.complete(token.trim())
    setStep('done')
    // Full reload → setup gate loads the new status (needs_setup=false) and unlocks /login.
    setTimeout(() => { window.location.href = '/login' }, 1500)
  })

  const stepIdx = ORDER.indexOf(step as Step)

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      background: 'var(--bg-canvas)', padding: '48px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ marginBottom: 10 }}>
          <Logo size={16} />
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 4px' }}>{t('setup_title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
          {t('setup_subtitle')}
        </p>

        {/* Stepper */}
        {step !== 'done' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {ORDER.map((s, i) => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= stepIdx ? 'var(--accent)' : 'var(--border)',
              }} />
            ))}
          </div>
        )}

        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 22,
        }}>
          {/* 1 — Token */}
          {step === 'token' && (
            <>
              <SectionTitle icon={<KeyRound size={15} />} title={t('setup_step_token')} />
              <p style={hintStyle}>
                {t('setup_token_hint')}
              </p>
              <label style={labelStyle}>{t('setup_token_label')}</label>
              <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={token} autoFocus
                onChange={e => { setToken(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && token.trim()) submitToken() }}
                placeholder="••••••••••••••••" />
              <ErrorBox error={error} />
              <Btn style={{ ...fullBtn, marginTop: 14 }}
                disabled={!token.trim() || loading} onClick={submitToken}>
                {loading ? t('loading_short') : <>{t('setup_btn_continue')} <ArrowRight size={15} /></>}
              </Btn>
            </>
          )}

          {/* 2 — Admin */}
          {step === 'admin' && (
            <>
              <SectionTitle icon={<UserCog size={15} />} title={t('setup_step_admin')} />
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t('setup_username')}</label>
                  <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>{t('setup_email')}</label>
                  <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="admin@example.com" />
                </div>
                <div>
                  <label style={labelStyle}>{t('setup_password')}</label>
                  <input style={inputStyle} type="password" value={pw} onChange={e => setPw(e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 4 }}>
                    {t('setup_pw_policy')}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{t('setup_password_confirm')}</label>
                  <input style={inputStyle} type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
                </div>
              </div>
              <ErrorBox error={error} />
              <Btn style={{ ...fullBtn, marginTop: 14 }} disabled={loading} onClick={submitAdmin}>
                {loading ? t('loading_short') : <>{t('setup_btn_create_admin')} <ArrowRight size={15} /></>}
              </Btn>
            </>
          )}

          {/* 3 — TOTP (optional) */}
          {step === 'totp' && (
            <>
              <SectionTitle icon={<ShieldCheck size={15} />} title={t('setup_step_totp')} />
              {!totpStarted ? (
                <>
                  <p style={hintStyle}>
                    {t('setup_totp_hint')}
                  </p>
                  <ErrorBox error={error} />
                  <Btn style={fullBtn} disabled={loading} onClick={startTotp}>
                    {loading ? t('loading_short') : t('setup_btn_enable_totp')}
                  </Btn>
                  <Btn variant="secondary" style={{ ...fullBtn, marginTop: 8 }} disabled={loading} onClick={() => { setError(''); setStep('apikey') }}>
                    {t('setup_btn_skip')}
                  </Btn>
                </>
              ) : (
                <>
                  <p style={{ ...hintStyle, margin: '0 0 12px' }}>
                    {t('setup_totp_scan')}
                  </p>
                  <QrCode src={totpQr} label={t('setup_step_totp')} />
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '7px 10px',
                  }}>
                    <code style={{ fontSize: 12, color: 'var(--text)', flex: 1, wordBreak: 'break-all' }}>{totpSecret}</code>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(totpSecret) }}
                      title={t('btn_copy')} aria-label={t('btn_copy')} style={copyBtn}>
                      <Copy size={14} />
                    </button>
                  </div>
                  <label style={{ ...labelStyle, marginTop: 14 }}>{t('setup_totp_code')}</label>
                  <input style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: 'monospace' }}
                    value={totpCode} maxLength={6} placeholder="000000" autoFocus
                    onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} />
                  <ErrorBox error={error} />
                  <Btn style={{ ...fullBtn, marginTop: 14 }}
                    disabled={totpCode.length !== 6 || loading} onClick={confirmTotp}>
                    {loading ? t('loading_short') : t('setup_btn_verify_totp')}
                  </Btn>
                </>
              )}
            </>
          )}

          {/* 4 — API-Key */}
          {step === 'apikey' && (
            <>
              <SectionTitle icon={<KeyRound size={15} />} title={t('setup_step_apikey')} />
              {!apiKey ? (
                <>
                  <p style={hintStyle}>
                    {t('setup_apikey_hint')}
                  </p>
                  <ErrorBox error={error} />
                  <Btn style={fullBtn} disabled={loading} onClick={genApiKey}>
                    {loading ? t('loading_short') : t('setup_btn_gen_apikey')}
                  </Btn>
                </>
              ) : (
                <>
                  <div style={{
                    padding: '10px 12px', background: 'color-mix(in srgb, var(--sev-high) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--sev-high) 30%, transparent)', borderRadius: 'var(--radius)',
                    fontSize: 12, color: 'var(--sev-high)', lineHeight: 1.6, marginBottom: 12,
                  }}>
                    {t('setup_apikey_warning')}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '9px 12px',
                  }}>
                    <code style={{ fontSize: 12.5, color: 'var(--text)', flex: 1, wordBreak: 'break-all' }}>{apiKey}</code>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                      title={copied ? t('btn_copied') : t('btn_copy')} aria-label={copied ? t('btn_copied') : t('btn_copy')}
                      style={{ ...copyBtn, color: copied ? 'var(--text)' : 'var(--text-muted)' }}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <Btn style={{ ...fullBtn, marginTop: 14 }} onClick={() => { setError(''); setStep('settings') }}>
                    {t('setup_btn_continue')} <ArrowRight size={15} />
                  </Btn>
                </>
              )}
            </>
          )}

          {/* 5 — Settings */}
          {step === 'settings' && (
            <>
              <SectionTitle icon={<Languages size={15} />} title={t('setup_step_settings')} />
              <p style={hintStyle}>{t('setup_language_hint')}</p>
              <label style={labelStyle}>{t('setup_language')}</label>
              <LanguageSelect value={lang} onChange={setLang} label={t('setup_language')}
                style={{ width: '100%', padding: '9px 12px', fontSize: 13 }} />
              <ErrorBox error={error} />
              <Btn style={{ ...fullBtn, marginTop: 18 }} disabled={loading} onClick={finish}>
                {loading ? t('loading_short') : t('setup_btn_finish')}
              </Btn>
            </>
          )}

          {/* Done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '14px 0' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={26} color="var(--accent)" />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 6px' }}>{t('setup_done_title')}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{t('setup_done_text')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: 'var(--text)' }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
    </div>
  )
}

function ErrorBox({ error }: { error: string }) {
  if (!error) return null
  return (
    <div style={{
      marginTop: 12, padding: '9px 12px',
      background: 'color-mix(in srgb, var(--sev-critical) 10%, transparent)',
      border: '1px solid color-mix(in srgb, var(--sev-critical) 25%, transparent)', borderRadius: 'var(--radius)',
      fontSize: 12, color: 'var(--sev-critical)',
    }} role="alert">{error}</div>
  )
}
