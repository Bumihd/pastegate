import { useLang } from '../../lib/LangContext'
import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { orgSettings } from '../../lib/api'
import { FALLBACK_LANG, isLang, type Lang } from '../../lib/i18n'
import { Card, Btn, Alert } from '../../components/ui/Card'
import { LanguageSelect } from '../../components/ui/LanguageSelect'

export default function Settings() {
  const { t, applyOrgLang } = useLang()
  const [retention, setRetention] = useState('90')
  const [saved, setSaved]         = useState(false)

  // Organization language (server setting, admin)
  const [orgLang,       setOrgLang]       = useState<Lang>(FALLBACK_LANG)
  const [orgLangSaved,  setOrgLangSaved]  = useState<Lang | null>(null)
  const [orgLangBusy,   setOrgLangBusy]   = useState(false)
  const [orgLangMsg,    setOrgLangMsg]    = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    orgSettings.get()
      .then(s => {
        if (isLang(s.default_lang)) { setOrgLang(s.default_lang); setOrgLangSaved(s.default_lang) }
      })
      .catch(() => setOrgLangMsg({ type: 'error', text: t('settings_org_lang_load_failed') }))
  }, [])

  const saveOrgLang = async () => {
    setOrgLangBusy(true)
    setOrgLangMsg(null)
    try {
      const res = await orgSettings.update({ default_lang: orgLang })
      const l = isLang(res.default_lang) ? res.default_lang : orgLang
      setOrgLang(l)
      setOrgLangSaved(l)
      applyOrgLang(l)
      setOrgLangMsg({ type: 'success', text: t('settings_org_lang_saved') })
    } catch (e: any) {
      setOrgLangMsg({ type: 'error', text: e?.message || t('settings_org_lang_save_failed') })
    } finally {
      setOrgLangBusy(false)
    }
  }

  // Azure SSO
  const [azureEnabled,  setAzureEnabled]  = useState(false)
  const [azureTenant,   setAzureTenant]   = useState('')
  const [azureClientId, setAzureClientId] = useState('')
  const [azureSecret,   setAzureSecret]   = useState('')

  // LDAP
  const [ldapEnabled,   setLdapEnabled]   = useState(false)
  const [ldapHost,      setLdapHost]      = useState('')
  const [ldapPort,      setLdapPort]      = useState('636')
  const [ldapBaseDn,    setLdapBaseDn]    = useState('')
  const [ldapBindDn,    setLdapBindDn]    = useState('')
  const [ldapBindPw,    setLdapBindPw]    = useState('')
  const [ldapUserAttr,  setLdapUserAttr]  = useState('sAMAccountName')

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('settings_h1')}</h1>

      {/* Organization language */}
      <Card title={t('settings_org_lang')} style={cardGap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <LanguageSelect value={orgLang} onChange={l => { setOrgLang(l); setOrgLangMsg(null) }}
            label={t('settings_org_lang')} style={{ minWidth: 180, padding: '8px 10px', fontSize: 13 }} />
          <Btn size="sm" onClick={saveOrgLang}
            disabled={orgLangBusy || orgLangSaved === null || orgLang === orgLangSaved}>
            <Save size={13} />{orgLangBusy ? '…' : t('save')}
          </Btn>
        </div>
        <p style={hint}>{t('settings_org_lang_hint')}</p>
        {orgLangMsg && (
          <div style={{ marginTop: 10 }}>
            <Alert type={orgLangMsg.type}>{orgLangMsg.text}</Alert>
          </div>
        )}
      </Card>

      {/* Data retention */}
      <Card title={t('settings_section_data')} style={cardGap}>
        <Field label={t('settings_retention')}>
          <input style={inp} type="number" min="7" max="730"
            value={retention} onChange={e => setRetention(e.target.value)} />
        </Field>
        <p style={hint}>{t('settings_retention_hint')}</p>
      </Card>

      {/* Azure SSO */}
      <Card title={t('settings_azure')} style={cardGap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Toggle value={azureEnabled} onChange={setAzureEnabled} label={t('settings_azure')} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {azureEnabled ? t('settings_enabled') : t('settings_disabled')}
          </span>
        </div>
        {azureEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label={t('settings_tenant_id')}>
              <input style={inp} value={azureTenant}
                onChange={e => setAzureTenant(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Field>
            <Field label={t('settings_client_id')}>
              <input style={inp} value={azureClientId}
                onChange={e => setAzureClientId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Field>
            <Field label={t('settings_client_secret')}>
              <input style={inp} type="password" value={azureSecret}
                onChange={e => setAzureSecret(e.target.value)}
                placeholder="••••••••••••••••" />
            </Field>
            <Alert type="warning">
              {t('settings_redirect_uri')}{' '}
              <code style={{ color: 'var(--text)' }}>
                {window.location.origin}/api/v1/auth/azure/callback
              </code>
            </Alert>
            <p style={hint}>
              {t('settings_azure_rolemap')} <code>pastegate-itsec</code>, <code>pastegate-admin</code>,
              {' '}<code>pastegate-management</code>, <code>pastegate-dataprivacy</code>.
            </p>
          </div>
        )}
      </Card>

      {/* LDAP */}
      <Card title={t('settings_ldap')} style={cardGap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Toggle value={ldapEnabled} onChange={setLdapEnabled} label={t('settings_ldap')} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {ldapEnabled ? t('settings_enabled') : t('settings_disabled')}
          </span>
        </div>
        {ldapEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10 }}>
              <Field label={t('settings_ldap_host')}>
                <input style={inp} value={ldapHost}
                  onChange={e => setLdapHost(e.target.value)}
                  placeholder="ldaps://dc.example.com" />
              </Field>
              <Field label={t('settings_ldap_port')}>
                <input style={inp} value={ldapPort}
                  onChange={e => setLdapPort(e.target.value)}
                  placeholder="636" />
              </Field>
            </div>
            <Field label={t('settings_ldap_base_dn')}>
              <input style={inp} value={ldapBaseDn}
                onChange={e => setLdapBaseDn(e.target.value)}
                placeholder="DC=example,DC=com" />
            </Field>
            <Field label={t('settings_ldap_bind_dn')}>
              <input style={inp} value={ldapBindDn}
                onChange={e => setLdapBindDn(e.target.value)}
                placeholder="CN=pastegate,OU=ServiceAccounts,DC=example,DC=com" />
            </Field>
            <Field label={t('settings_ldap_bind_pass')}>
              <input style={inp} type="password" value={ldapBindPw}
                onChange={e => setLdapBindPw(e.target.value)} />
            </Field>
            <Field label={t('settings_ldap_user_attr')}>
              <input style={inp} value={ldapUserAttr}
                onChange={e => setLdapUserAttr(e.target.value)}
                placeholder="sAMAccountName" />
            </Field>
            <p style={hint}>
              {t('settings_ldap_rolemap_pre')} <code>pastegate-itsec</code>,
              {' '}<code>pastegate-admin</code> {t('settings_ldap_rolemap_post')}
            </p>
            <Alert type="warning">{t('settings_ldap_phase2')}</Alert>
          </div>
        )}
      </Card>

      {/* Server-Info */}
      <Card title={t('settings_section_server')} style={cardGap}>
        {[
          { label: t('settings_info_version'), value: `Pastegate v${__APP_VERSION__}` },
          { label: t('settings_info_api'), value: '/api/v1' },
          { label: t('settings_info_license'), value: 'Open Source (MIT)' },
          { label: t('settings_info_server_url'), value: window.location.origin },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: '1px solid var(--bg-elevated)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace' }}>{r.value}</span>
          </div>
        ))}
      </Card>

      <Btn onClick={save}>
        <Save size={14} />
        {saved ? `${t('settings_saved')} ✓` : t('settings_save_btn')}
      </Btn>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:12, color:'var(--text-muted)',
        marginBottom:6 }}>{label}</label>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label}
      onClick={() => onChange(!value)} style={{
      width:36, height:20, borderRadius:10, cursor:'pointer', position:'relative', padding:0,
      background: value ? 'var(--accent-dim)' : 'var(--bg-elevated)',
      border:`1px solid ${value ? 'var(--accent-border)' : 'var(--border)'}`,
      transition:'all .2s', flexShrink:0,
    }}>
      <span style={{
        position:'absolute', top:2, left: value ? 16 : 2,
        width:14, height:14, borderRadius:'50%', transition:'left .2s',
        background: value ? 'var(--accent)' : 'var(--text-muted)',
      }} />
    </button>
  )
}

const cardGap: React.CSSProperties = { marginBottom: 16 }
const inp: React.CSSProperties = {
  width:'100%', padding:'8px 12px', background:'var(--bg-elevated)',
  border:'1px solid var(--border)', borderRadius:'var(--radius)',
  color:'var(--text)', fontSize:13, fontFamily:'inherit',
}
const hint: React.CSSProperties = {
  fontSize:11, color:'var(--text-hint)', marginTop:6, lineHeight:1.6,
}
