import { useLang } from '../../lib/LangContext'
import { useState, useEffect } from 'react'
import { apiKeys, extensionBuilder } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import type { Lang } from '../../lib/i18n'
import { Card, Btn, Alert } from '../../components/ui/Card'
import { LanguageSelect } from '../../components/ui/LanguageSelect'
import { Download, Key, Globe, Server } from 'lucide-react'

type UrlMode = 'auto' | 'https-domain' | 'http-domain' | 'https-ip' | 'http-ip' | 'custom'

export default function BuildExtension() {
  const { t, lang: uiLang, orgLang } = useLang()
  const [keys, setKeys]       = useState<any[]>([])
  const [keyId, setKeyId]     = useState('')
  // Extension follows the organization language (end users can additionally switch to English)
  const [lang, setLang]       = useState<Lang>(orgLang)
  const [langTouched, setLangTouched] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [replacePrevious, setReplacePrevious] = useState(false)

  // URL configuration
  const [urlMode, setUrlMode]     = useState<UrlMode>('auto')
  const [domain, setDomain]       = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [customUrl, setCustomUrl] = useState('')

  // On mount: derive defaults from the current browser URL
  useEffect(() => {
    const host = window.location.hostname
    // If the hostname is an IP, prefill the IP field, otherwise the domain field
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
    if (isIp) {
      setIpAddress(host)
    } else {
      setDomain(host)
    }
  }, [])

  // orgLang loads asynchronously – apply the default as long as nothing was chosen manually
  useEffect(() => { if (!langTouched) setLang(orgLang) }, [orgLang, langTouched])

  useEffect(() => {
    apiKeys.list().then(k => {
      // Base keys only: deploy keys belong to a base key and are regenerated per build
      const active = k.filter((x: any) => x.is_active && !x.parent_id)
      setKeys(active)
      if (active.length > 0) setKeyId(active[0].id)
    }).catch(() => setError(t('apikeys_load_failed')))
  }, [t])

  // Computes the final URL passed to the backend
  function computeServerUrl(): string | undefined {
    switch (urlMode) {
      case 'auto':
        return undefined  // backend uses .env + header detection
      case 'https-domain':
        return domain ? `https://${domain.replace(/^https?:\/\//, '')}` : undefined
      case 'http-domain':
        return domain ? `http://${domain.replace(/^https?:\/\//, '')}` : undefined
      case 'https-ip':
        return ipAddress ? `https://${ipAddress}` : undefined
      case 'http-ip':
        return ipAddress ? `http://${ipAddress}` : undefined
      case 'custom':
        return customUrl.trim() || undefined
    }
  }

  const previewUrl = computeServerUrl() || `${window.location.protocol}//${window.location.host}`

  const build = async () => {
    if (!keyId) { setError(t('build_select_key_first')); return }

    // URL validation
    const url = computeServerUrl()
    if (urlMode !== 'auto' && !url) {
      setError(t('build_url_required'))
      return
    }
    if (url) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('proto')
        if (!parsed.hostname) throw new Error('host')
        // Embedded credentials (user:pass@host) are not allowed in a server URL
        if (parsed.username || parsed.password) throw new Error('creds')
      } catch {
        setError(t('build_url_invalid'))
        return
      }
    }

    setBuilding(true)
    setError('')
    setSuccess(false)
    try {
      const blob = await extensionBuilder.build(lang, keyId, url, replacePrevious)
      const objUrl = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = objUrl
      a.download = `pastegate-extension-${lang}.zip`
      a.click()
      URL.revokeObjectURL(objUrl)
      setSuccess(true)
    } catch (e: any) {
      setError(e.message || t('build_failed'))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>{t('build_h1_full')}</h1>

      <Card>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          {t('build_intro')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* API-Key */}
          <div>
            <label style={label} htmlFor="build-key">
              <Key size={13} style={{ marginRight: 6 }} />
              {t('build_select_key')}
            </label>
            <select id="build-key" style={select} value={keyId} onChange={e => setKeyId(e.target.value)}>
              {keys.length === 0
                ? <option value="">{t('build_no_keys')}</option>
                : keys.map(k => (
                    <option key={k.id} value={k.id}>
                      {k.name} {k.last_used
                        ? `(${t('build_last_used')}: ${fmtDate(k.last_used, uiLang)})`
                        : `(${t('build_never_used')})`}
                    </option>
                  ))
              }
            </select>
            <p style={hint}>{t('build_key_recommendation')}</p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10,
              fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={replacePrevious}
                onChange={e => setReplacePrevious(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                {t('build_replace_previous')}
                <span style={{ display: 'block', ...hint }}>{t('build_replace_previous_hint')}</span>
              </span>
            </label>
          </div>

          {/* Server URL configuration */}
          <div>
            <label style={label} htmlFor="build-url-mode">
              <Server size={13} style={{ marginRight: 6 }} />
              {t('build_server_url')}
            </label>
            <select id="build-url-mode" style={select} value={urlMode}
              onChange={e => setUrlMode(e.target.value as UrlMode)}>
              <option value="auto">{t('build_url_mode_auto')}</option>
              <option value="https-domain">{t('build_url_mode_https_domain')}</option>
              <option value="http-domain">{t('build_url_mode_http_domain')}</option>
              <option value="https-ip">{t('build_url_mode_https_ip')}</option>
              <option value="http-ip">{t('build_url_mode_http_ip')}</option>
              <option value="custom">{t('build_url_mode_custom')}</option>
            </select>

            {/* Technical example values – language-neutral */}
            {(urlMode === 'https-domain' || urlMode === 'http-domain') && (
              <input style={input} type="text" value={domain} aria-label={t('build_server_url')}
                onChange={e => setDomain(e.target.value)}
                placeholder="pastegate.example.com" />
            )}
            {(urlMode === 'https-ip' || urlMode === 'http-ip') && (
              <input style={input} type="text" value={ipAddress} aria-label={t('build_server_url')}
                onChange={e => setIpAddress(e.target.value)}
                placeholder="10.0.0.10" />
            )}
            {urlMode === 'custom' && (
              <input style={input} type="text" value={customUrl} aria-label={t('build_server_url')}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://internal.example.com:8443" />
            )}

            {/* URL Preview */}
            <div style={preview}>
              <span style={{ color: 'var(--text-muted)' }}>{t('build_url_preview')}: </span>
              <code style={{ color: 'var(--text)', fontSize: 12 }}>{previewUrl}</code>
            </div>
            <p style={hint}>{t('build_url_hint')}</p>
          </div>

          {/* Language */}
          <div>
            <label style={label}>
              <Globe size={13} style={{ marginRight: 6 }} />
              {t('build_lang')}
            </label>
            <LanguageSelect value={lang} label={t('build_lang')}
              onChange={l => { setLang(l); setLangTouched(true) }}
              style={{ ...select, width: 'auto', minWidth: 180 }} />
            <p style={hint}>{t('build_lang_hint')}</p>
          </div>
        </div>

        {error && <div style={{ marginTop: 16 }}><Alert>{error}</Alert></div>}

        {success && <div style={{ marginTop: 16 }}><Alert type="success">{t('build_success')}</Alert></div>}

        <Btn onClick={build} disabled={building || keys.length === 0} style={{ marginTop: 20 }}>
          <Download size={14} />
          {building ? t('loading') : t('btn_download')}
        </Btn>
      </Card>

      <Card title={t('build_mdm')} style={{ marginTop: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {t('build_mdm_hint')}
        </p>
      </Card>
    </div>
  )
}

const label: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 400,
}
const select: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', marginTop: 8,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13,
  fontFamily: 'monospace',
}
const preview: React.CSSProperties = {
  marginTop: 8, padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', fontSize: 12,
}
const hint: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-hint)', marginTop: 5, lineHeight: 1.5,
}
