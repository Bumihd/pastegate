import { useLang } from '../../lib/LangContext'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { QrCode } from '../../components/ui/QrCode'
import { Card, Btn, Alert } from '../../components/ui/Card'
import { auth } from '../../lib/api'

// Product names – not translated
const TOTP_APPS = ['Google Authenticator', 'Aegis', 'Microsoft Authenticator']

export default function TwoFactor() {
  const { t } = useLang()
  const [step,    setStep]    = useState<'init'|'scan'|'verify'|'done'>('init')
  const [qr,      setQr]      = useState('')
  const [secret,  setSecret]  = useState('')
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  const setup = async () => {
    setLoading(true); setError('')
    try {
      const data = await auth.totpSetup()
      setQr(data.qr_image)
      setSecret(data.secret)
      setStep('scan')
    } catch (e: any) {
      setError(e.message || t('unknown_error'))
    } finally { setLoading(false) }
  }

  const verify = async () => {
    if (code.length !== 6) { setError(t('login_totp')); return }
    setLoading(true); setError('')
    try {
      await auth.totpConfirm(code)
      setStep('done')
    } catch (e: any) {
      setError(e.message || t('twofa_invalid_code'))
    } finally { setLoading(false) }
  }

  const copySecret = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fullWidth: React.CSSProperties = { width: '100%', justifyContent: 'center' }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('twofa_h1')}</h1>

      {step === 'init' && (
        <Card>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
            {t('twofa_intro')}{' '}
            {t('twofa_compatible')}{' '}
            {TOTP_APPS.map((app, i) => (
              <span key={app}>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{app}</span>
                {i < TOTP_APPS.length - 1 ? ', ' : ' '}
              </span>
            ))}
            {t('twofa_compatible_rest')}
          </p>
          {error && <div style={{ marginBottom: 14 }}><Alert>{error}</Alert></div>}
          <Btn onClick={setup} disabled={loading} style={fullWidth}>
            {loading ? t('loading_short') : t('twofa_setup_now')}
          </Btn>
        </Card>
      )}

      {step === 'scan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={t('twofa_scan')} subtitle={t('twofa_scan_desc')}>
            <QrCode src={qr} label={t('twofa_qr_label')} />
            <p style={{ fontSize: 11, color: 'var(--text-hint)', textAlign: 'center', marginTop: 8 }}>
              {t('twofa_scan_hint')}
            </p>

            {/* Manual key */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('twofa_manual')}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '8px 12px',
              }}>
                <code style={{ fontSize: 13, color: 'var(--text)', flex: 1,
                  letterSpacing: '0.1em', wordBreak: 'break-all' }}>
                  {secret}
                </code>
                <button onClick={copySecret} title={t('twofa_copy_secret')} aria-label={t('twofa_copy_secret')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: copied ? 'var(--text)' : 'var(--text-muted)', flexShrink: 0,
                  }}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          </Card>

          <Btn onClick={() => setStep('verify')} style={fullWidth}>
            {t('twofa_next')}
          </Btn>
        </div>
      )}

      {step === 'verify' && (
        <Card title={t('twofa_verify')} subtitle={t('twofa_verify_desc')}>
          <input
            aria-label={t('login_totp')}
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{
              width: '100%', padding: '14px', fontSize: 22, textAlign: 'center',
              letterSpacing: '0.4em', background: 'var(--bg-elevated)',
              border: `1px solid ${error ? 'var(--sev-critical)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', color: 'var(--text)',
              marginBottom: 12, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
            }}
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }}
            placeholder="000000"
            maxLength={6}
            autoFocus
          />
          {error && <div style={{ marginBottom: 12 }}><Alert>{error}</Alert></div>}
          <Btn onClick={verify} disabled={loading || code.length !== 6} style={fullWidth}>
            {loading ? t('loading_short') : t('btn_activate_2fa')}
          </Btn>
          <Btn variant="ghost" onClick={() => setStep('scan')} style={{ ...fullWidth, marginTop: 8 }}>
            {t('twofa_back_to_qr')}
          </Btn>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Check size={24} color="var(--text)" />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
              {t('twofa_done')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {t('twofa_done_desc')}
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
