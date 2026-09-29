import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react'
import { type Lang, FALLBACK_LANG, browserLang, getStoredLang, isLang, makeT, storeLang } from './i18n'
import { meta, setRequestLang } from './api'

interface LangCtx {
  lang: Lang
  /** Organization language (server setting) – default for dashboard and extension. */
  orgLang: Lang
  /** Call after changing the organization language so it takes effect immediately. */
  applyOrgLang: (l: Lang) => void
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<LangCtx>({
  lang: FALLBACK_LANG,
  orgLang: FALLBACK_LANG,
  applyOrgLang: () => {},
  setLang: () => {},
  t: makeT(FALLBACK_LANG),
})

export function LangProvider({ children }: { children: ReactNode }) {
  // Priority: explicit choice in this browser → organization language → browser language
  const [chosen, setChosen]   = useState<Lang | null>(getStoredLang)
  const [orgLang, setOrgLang] = useState<Lang | null>(null)

  useEffect(() => {
    meta.get()
      .then(m => { if (isLang(m.default_lang)) setOrgLang(m.default_lang) })
      .catch(() => { /* offline/alte API → Browsersprache */ })
  }, [])

  const lang: Lang = chosen ?? orgLang ?? browserLang()

  useEffect(() => {
    setRequestLang(lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Lang) => {
    storeLang(l)
    setChosen(l)
  }

  const t = useMemo(() => makeT(lang), [lang])
  const value = useMemo(
    () => ({ lang, orgLang: orgLang ?? browserLang(), applyOrgLang: setOrgLang, setLang, t }),
    [lang, orgLang, t],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang() {
  return useContext(Ctx)
}
