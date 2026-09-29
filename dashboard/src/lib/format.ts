// Locale-dependent formatting – always call with the active dashboard language.

import type { Lang } from './i18n'

export function fmtDateTime(iso: string | null | undefined, lang: Lang,
                            opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(lang, opts)
}

export function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang)
}

export function fmtNumber(n: number, lang: Lang): string {
  return n.toLocaleString(lang)
}

/** Day date from the trend API (YYYY-MM-DD) as day + month. */
export function fmtTrendDate(value: unknown, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!m) return String(value ?? '')
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' })
}
