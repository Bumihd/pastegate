// Gemeinsame Helfer für die Doku-Inhalte.
//
// Jede Doku (user / mdm / api) hat einen Ordner mit einer Datei pro Sprache.
// en.ts ist die Referenz; alle anderen Sprachen sind gegen denselben Typ
// typisiert, fehlende Abschnitte brechen also den Typecheck.
// Neue Sprache: <doku>/<code>.ts anlegen und in <doku>/index.ts eintragen.
// Fehlt eine Sprache, fällt die Seite auf Englisch zurück.

import { Fragment, type ReactNode } from 'react'
import type { Lang } from '../../../lib/i18n'

export type DocSet<T> = { en: T } & Partial<Record<Lang, T>>

export function pickDoc<T>(set: DocSet<T>, lang: Lang): T {
  return set[lang] ?? set.en
}

/**
 * Minimales Inline-Markup für Doku-Texte (kein HTML in den Sprachdateien):
 *   `code`   → <code>
 *   **fett** → <strong>
 */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>)
    if (m[1] !== undefined) {
      parts.push(<code key={i++} style={inlineCode}>{m[1]}</code>)
    } else {
      parts.push(<strong key={i++} style={{ fontWeight: 500, color: 'var(--text)' }}>{m[2]}</strong>)
    }
    last = re.lastIndex
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>)
  return <>{parts}</>
}

const inlineCode: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '0.95em',
  color: 'var(--text)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0 4px',
}

export const codeBlock: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  fontSize: 11.5,
  lineHeight: 1.6,
  color: 'var(--text)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  margin: '8px 0',
  overflowX: 'auto',
  whiteSpace: 'pre',
}
