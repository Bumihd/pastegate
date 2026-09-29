// Dashboard i18n
//
// One file per language under src/locales/. en.ts is the reference: every other
// language is typed as `Messages`, so missing keys break the type check.
// New language: create locales/<code>.ts and add it to LANGUAGES below.

import en from '../locales/en'
import de from '../locales/de'
import fr from '../locales/fr'
import es from '../locales/es'
import type { Messages } from '../locales/en'

export const LANGUAGES = [
  { code: 'de', label: 'Deutsch',  messages: de },
  { code: 'en', label: 'English',  messages: en },
  { code: 'fr', label: 'Français', messages: fr },
  { code: 'es', label: 'Español',  messages: es },
] as const satisfies readonly { code: string; label: string; messages: Messages }[]

export type Lang = typeof LANGUAGES[number]['code']

export const FALLBACK_LANG: Lang = 'en'

const CATALOG: Record<string, Record<string, string>> =
  Object.fromEntries(LANGUAGES.map(l => [l.code, l.messages]))

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && value in CATALOG
}

/** Derive the language from a BCP 47 tag ("fr-CH" → "fr"), otherwise null. */
export function matchLang(tag: string | null | undefined): Lang | null {
  const base = (tag || '').toLowerCase().split('-')[0]
  return isLang(base) ? base : null
}

const STORAGE_KEY = 'dashboard_lang'

/** Language explicitly chosen in this browser (null = use the organization default). */
export function getStoredLang(): Lang | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return isLang(s) ? s : null
  } catch {
    return null
  }
}

export function storeLang(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* private mode */ }
}

export function browserLang(): Lang {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const l = matchLang(tag)
    if (l) return l
  }
  return FALLBACK_LANG
}

export function makeT(lang: Lang) {
  const primary = CATALOG[lang]
  const fallback = CATALOG[FALLBACK_LANG]
  return (key: string, vars?: Record<string, string | number>): string => {
    let str = primary?.[key] ?? fallback[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.split(`{${k}}`).join(String(v))
      }
    }
    return str
  }
}
