import { useLang } from '../../lib/LangContext'
import { useState } from 'react'
import { Code, ChevronDown, ChevronRight, Lock, Globe, KeyRound } from 'lucide-react'
import { API_DOCS, API_SECTIONS, type Auth, type Method } from './content/api'
import { codeBlock, pickDoc, Rich } from './content/shared'

// Color = meaning only: read neutral, write blue, delete red.
const METHOD_COLOR: Record<Method, string> = {
  GET:    'var(--text-muted)',
  POST:   'var(--sev-medium)',
  PUT:    'var(--sev-medium)',
  PATCH:  'var(--sev-medium)',
  DELETE: 'var(--sev-critical)',
}

type AnyEndpointText = {
  description: string
  body?: Record<string, string>
  query?: Record<string, string>
}

const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export default function ApiDocs() {
  const { t, lang } = useLang()
  const doc = pickDoc(API_DOCS, lang)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setOpen(o => ({ ...o, [key]: !o[key] }))

  const authLabel: Record<Auth, string> = {
    'public':  doc.ui.authPublic,
    'api-key': doc.ui.authApiKey,
    'jwt':     doc.ui.authJwt,
    'token':   doc.ui.authToken,
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Code size={18} color="var(--text-muted)" />
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('apidoc_title')}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
        {doc.ui.baseUrl}:{' '}
        <code style={{ color: 'var(--text)', fontFamily: mono }}>https://pastegate.example.com</code>
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        <Rich text={doc.ui.languageNote} />
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        {[
          { icon: Globe,    label: doc.ui.authPublic, desc: doc.ui.authPublicDesc },
          { icon: KeyRound, label: doc.ui.authApiKey, desc: 'X-API-Key: pg_...' },
          { icon: Lock,     label: doc.ui.authJwt,    desc: 'Authorization: Bearer eyJ...' },
          { icon: KeyRound, label: doc.ui.authToken,  desc: 'Authorization: Bearer pgr_...' },
        ].map(a => (
          <div key={a.label} style={{ flex: '1 1 200px', padding: '10px 12px',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <a.icon size={13} color="var(--text-muted)" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: mono }}>{a.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {API_SECTIONS.map(section => (
        <div key={section.id} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)',
            marginBottom: 8, paddingLeft: 4 }}>
            {doc.sections[section.id]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {section.endpoints.map(ep => {
              const key = `${ep.method} ${ep.path}`
              const isOpen = !!open[key]
              const text = doc.endpoints[ep.id] as AnyEndpointText
              const color = METHOD_COLOR[ep.method]
              const roles = 'roles' in ep ? ep.roles : undefined
              const body  = 'body'  in ep ? ep.body  : undefined
              const query = 'query' in ep ? ep.query : undefined
              return (
                <div key={key} style={{ background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  overflow: 'hidden' }}>
                  <button onClick={() => toggle(key)} aria-expanded={isOpen} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                  }}>
                    {isOpen
                      ? <ChevronDown size={13} color="var(--text-muted)" />
                      : <ChevronRight size={13} color="var(--text-muted)" />}
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 7px',
                      borderRadius: 4, fontFamily: mono, minWidth: 44, textAlign: 'center',
                      color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
                      flexShrink: 0 }}>
                      {ep.method}
                    </span>
                    <code style={{ fontSize: 12, color: 'var(--text)', flex: 1, fontFamily: mono,
                      overflowWrap: 'anywhere' }}>
                      {ep.path}
                    </code>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)',
                      padding: '1px 6px', borderRadius: 4,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      flexShrink: 0 }}>
                      {authLabel[ep.auth]}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 12.5, color: 'var(--text-muted)',
                        margin: '10px 0', lineHeight: 1.6 }}>
                        <Rich text={text.description} />
                      </p>
                      {roles && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {doc.ui.roles}:{' '}
                          </span>
                          {roles.map(r => (
                            <span key={r} style={{ fontSize: 11, padding: '1px 6px',
                              borderRadius: 4, marginRight: 4,
                              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                              color: 'var(--text)' }}>{r}</span>
                          ))}
                        </div>
                      )}
                      {query && text.query && (
                        <FieldList title={doc.ui.queryParams} fields={query} texts={text.query} />
                      )}
                      {body && text.body && (
                        <FieldList title={doc.ui.requestBody} fields={body} texts={text.body} />
                      )}
                      {ep.response && (
                        <div>
                          <div style={fieldTitle}>{doc.ui.response}</div>
                          <pre style={{ ...codeBlock, margin: 0, whiteSpace: 'pre-wrap' }}>
                            {ep.response}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldList({ title, fields, texts }: {
  title: string
  fields: readonly string[]
  texts: Record<string, string>
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={fieldTitle}>{title}</div>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '10px 12px', fontFamily: mono }}>
        {fields.map(f => (
          <div key={f} style={{ fontSize: 11.5, marginBottom: 3, lineHeight: 1.5 }}>
            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{f}</span>
            <span style={{ color: 'var(--text-hint)' }}>{': '}</span>
            <span style={{ color: 'var(--text-muted)' }}>{texts[f]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const fieldTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6,
}
