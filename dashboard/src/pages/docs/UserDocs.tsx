import { useLang } from '../../lib/LangContext'
import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { USER_DOCS, USER_SECTION_ORDER, USER_SECTION_ROLES, type DocItem, type UserSectionId } from './content/user'
import { codeBlock, pickDoc, Rich } from './content/shared'

export default function UserDocs() {
  const { t, lang } = useLang()
  const { user } = useAuth()
  const role = user?.role || ''

  const doc = pickDoc(USER_DOCS, lang)
  const [open, setOpen] = useState<Partial<Record<UserSectionId, boolean>>>({ getting_started: true })

  const visible = USER_SECTION_ORDER.filter(id => {
    const roles = USER_SECTION_ROLES[id]
    return roles === null || roles.includes(role)
  })

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <BookOpen size={18} color="var(--text-muted)" />
        <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('doc_title')}</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        {t('doc_subtitle')}: <span style={{ color: 'var(--text)', fontWeight: 500 }}>{role}</span>.
      </p>

      {visible.map(id => {
        const section = doc.sections[id]
        const items: DocItem[] = Object.values(section.items)
        const isOpen = !!open[id]
        return (
          <div key={id} style={{ marginBottom: 8 }}>
            <button onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
              aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', background: 'var(--bg-surface)',
                border: '1px solid var(--border)', color: 'var(--text)',
                borderRadius: isOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
                cursor: 'pointer', textAlign: 'left' }}>
              {isOpen
                ? <ChevronDown size={14} color="var(--text-muted)" />
                : <ChevronRight size={14} color="var(--text-muted)" />}
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{section.title}</span>
            </button>

            {isOpen && (
              <div style={{ background: 'var(--bg-surface)',
                border: '1px solid var(--border)', borderTop: 'none',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                padding: '4px 0 8px' }}>
                {items.map((item, i) => (
                  <div key={i} style={{ padding: '14px 20px',
                    borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{item.heading}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)',
                      lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                      <Rich text={item.text} />
                    </div>
                    {item.code && <pre style={{ ...codeBlock, margin: '8px 0 0' }}>{item.code}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
