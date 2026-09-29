// Readable rule names: built-in rules from the generated extension locales,
// custom rules (custom_*) from the organization's list.

import { useCallback, useEffect, useState } from 'react'
import { customRules } from './api'
import { useAuth } from './auth'
import { useLang } from './LangContext'
import { FALLBACK_LANG } from './i18n'
import { RULE_NAMES } from '../locales/rules.generated'
import type { CustomRule, Role } from '../types'

/** Roles allowed to view and edit custom rules (the backend enforces this too). */
export const CUSTOM_RULE_ROLES: readonly Role[] = ['admin', 'itsec', 'infosec']

export const isCustomRuleId = (id: string) => id.startsWith('custom_')

export function prettifyRuleId(id: string) {
  return id.replace(/_/g, ' ')
}

export function builtinRuleName(id: string, lang: string): string | null {
  return RULE_NAMES[lang]?.[id] ?? RULE_NAMES[FALLBACK_LANG]?.[id] ?? null
}

// Module-wide cache: loaded once per session, refreshed by the "Detection rules" page.
let cache: Map<string, string> | null = null
let cacheOwner: string | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { listeners.forEach(fn => fn()) }

export function setCustomRuleCache(rules: CustomRule[]) {
  cache = new Map(rules.map(r => [r.rule_id, r.name]))
  notify()
}

function ensureLoaded(owner: string) {
  if (cacheOwner !== owner) { cache = null; inflight = null; cacheOwner = owner }
  if (cache || inflight) return
  inflight = customRules.list()
    .then(setCustomRuleCache)
    .catch(() => { cache = new Map() })  // no retry storm; the fallback label applies
    .finally(() => { inflight = null })
}

export function useRuleLabel(): (ruleId: string) => string {
  const { user } = useAuth()
  const { t, lang } = useLang()
  const [version, setVersion] = useState(0)
  const canList = !!user && CUSTOM_RULE_ROLES.includes(user.role)

  useEffect(() => {
    if (!canList || !user) return
    const fn = () => setVersion(v => v + 1)
    listeners.add(fn)
    ensureLoaded(user.username)
    return () => { listeners.delete(fn) }
  }, [canList, user?.username])

  return useCallback((ruleId: string) => {
    if (isCustomRuleId(ruleId)) {
      const name = canList ? cache?.get(ruleId) : undefined
      return name || t('rules_custom_fallback', { id: ruleId })
    }
    return builtinRuleName(ruleId, lang) ?? prettifyRuleId(ruleId)
  }, [t, lang, canList, version])
}
