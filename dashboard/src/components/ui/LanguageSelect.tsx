import { LANGUAGES, type Lang } from '../../lib/i18n'

export function LanguageSelect({ value, onChange, options, label, style }: {
  value: Lang
  onChange: (lang: Lang) => void
  /** Restrict to specific languages (default: all). */
  options?: readonly Lang[]
  label: string
  style?: React.CSSProperties
}) {
  const langs = LANGUAGES.filter(l => !options || options.includes(l.code))
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value as Lang)}
      style={{
        padding: '6px 8px', fontSize: 12.5, borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated)', color: 'var(--text)',
        border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
        ...style,
      }}>
      {langs.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
}
