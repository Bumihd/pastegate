import type { ReactNode } from 'react'
import { useLang } from '../../lib/LangContext'
import { Package, Monitor, Smartphone, Globe, Languages, type LucideIcon } from 'lucide-react'
import { MDM_DOCS } from './content/mdm'
import { codeBlock, pickDoc, Rich } from './content/shared'

export default function MdmGuide() {
  const { t, lang, orgLang } = useLang()
  const d = pickDoc(MDM_DOCS, lang)
  const serverUrl = window.location.origin
  const sampleLang = orgLang

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Package size={18} color="var(--text-muted)" />
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('mdm_title')}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        {d.intro}
      </p>

      {/* Step 1: generate package */}
      <Section icon={Package} title={d.step1.title}>
        <p><Rich text={d.step1.lead} /></p>
        <Steps items={d.step1.steps} />
        <p><Rich text={d.step1.zipNote} /></p>
        <pre style={codeBlock}>{`// config.js (auto-generated)
const PASTEGATE_CONFIG = {
  server_url: '${serverUrl}',
  api_key:    'pg_...',
  lang:       '${sampleLang}',
};`}</pre>
      </Section>

      {/* Intune */}
      <Section icon={Monitor} title="Microsoft Intune">
        <h3 style={h3}>{d.intune.optionA}</h3>
        <p>{d.intune.optionALead}</p>
        <Steps items={d.intune.optionASteps} />
        <pre style={codeBlock}>{`{
  "EXTENSION_ID": {
    "installation_mode": "force_installed",
    "update_url": "https://clients2.google.com/service/update2/crx"
  }
}`}</pre>
        <p style={note}>{d.intune.webStoreNote}</p>

        <h3 style={{ ...h3, marginTop: 16 }}>{d.intune.configTitle}</h3>
        <p><Rich text={d.intune.configLead} /></p>
        <pre style={codeBlock}>{`$key = 'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome\\3rdparty\\extensions\\EXTENSION_ID\\policy'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name server_url -Value '${serverUrl}'
Set-ItemProperty -Path $key -Name api_key    -Value 'pg_YOUR_API_KEY'
Set-ItemProperty -Path $key -Name lang       -Value '${sampleLang}'`}</pre>
        <p style={note}><Rich text={d.intune.precedenceNote} /></p>

        <h3 style={{ ...h3, marginTop: 16 }}>{d.intune.optionB}</h3>
        <Steps items={d.intune.optionBSteps} />
      </Section>

      {/* Jamf */}
      <Section icon={Smartphone} title="Jamf Pro (macOS)">
        <Steps items={d.jamf.steps} />
        <pre style={codeBlock}>{`<key>ExtensionInstallForcelist</key>
<array>
  <string>EXTENSION_ID;https://clients2.google.com/service/update2/crx</string>
</array>`}</pre>
        <p><Rich text={d.jamf.configLead} /></p>
        <pre style={codeBlock}>{`<key>server_url</key>
<string>${serverUrl}</string>
<key>api_key</key>
<string>pg_YOUR_API_KEY</string>
<key>lang</key>
<string>${sampleLang}</string>`}</pre>
        <p style={note}>{d.jamf.scope}</p>
      </Section>

      {/* Group Policy */}
      <Section icon={Globe} title="Windows Group Policy (GPO)">
        <Steps items={d.gpo.steps} />
        <p><Rich text={d.gpo.configLead} /></p>
        <pre style={codeBlock}>{`HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\3rdparty\\extensions\\EXTENSION_ID\\policy
  server_url   REG_SZ   ${serverUrl}
  api_key      REG_SZ   pg_YOUR_API_KEY
  lang         REG_SZ   ${sampleLang}`}</pre>
      </Section>

      {/* Manual */}
      <Section icon={Package} title={d.manual.title}>
        <Steps items={d.manual.steps} />
        <p style={note}>{d.manual.note}</p>
      </Section>

      {/* Language */}
      <Section icon={Languages} title={d.language.title}>
        {d.language.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}><Rich text={p} /></p>
        ))}
      </Section>

      {/* Best Practice API-Keys */}
      <div style={{ marginTop: 8, padding: '14px 16px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.bestPractice.title}</span>{' '}
        <Rich text={d.bestPractice.text} />
      </div>
    </div>
  )
}

function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol style={ol}>
      {items.map((s, i) => <li key={i}><Rich text={s} /></li>)}
    </ol>
  )
}

function Section({ icon: Icon, title, children }: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 16, background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <Icon size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-muted)',
        lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

const ol: React.CSSProperties = {
  paddingLeft: 20, margin: '8px 0', display: 'flex',
  flexDirection: 'column', gap: 4,
}
const h3: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6,
}
const note: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-hint)', marginTop: 8,
}
