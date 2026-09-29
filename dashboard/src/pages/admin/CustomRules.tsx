import { useLang } from '../../lib/LangContext'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { customRules } from '../../lib/api'
import { setCustomRuleCache } from '../../lib/rules'
import { Card, Btn, Alert, Badge } from '../../components/ui/Card'
import { Plus, Pencil, Trash2, X, Tags, KeyRound, Hash, Braces } from 'lucide-react'
import type {
  CustomRule, CustomRuleConfig, CustomRuleInput, CustomRuleKind, PrefixCharset, Severity,
} from '../../types'

const MAX_RULES = 200
const MAX_WORDS = 50
const SAMPLE_MAX = 4000
const MONO = "'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace"

const KINDS: { kind: CustomRuleKind; icon: typeof Tags }[] = [
  { kind: 'keywords', icon: Tags },
  { kind: 'prefix',   icon: KeyRound },
  { kind: 'pattern',  icon: Hash },
  { kind: 'regex',    icon: Braces },
]
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']
const CHARSETS: PrefixCharset[] = ['alnum', 'hex', 'base64url', 'digits']
const SEV_COLOR: Record<Severity, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)', medium: 'var(--sev-medium)', low: 'var(--sev-low)',
}

// The draft holds all four configurations so switching the type discards nothing.
// Lengths as strings so input fields can be empty.
interface Draft {
  name: string
  description: string
  severity: Severity
  is_active: boolean
  kind: CustomRuleKind | null
  words: string[]
  kwCase: boolean
  kwWhole: boolean
  prefix: string
  charset: PrefixCharset
  minLen: string
  maxLen: string
  template: string
  regex: string
  rxCase: boolean
  sample: string
  sampleTouched: boolean
}

function emptyDraft(): Draft {
  return {
    name: '', description: '', severity: 'high', is_active: true, kind: null,
    words: [], kwCase: false, kwWhole: true,
    prefix: '', charset: 'alnum', minLen: '16', maxLen: '64',
    template: '', regex: '', rxCase: false,
    sample: '', sampleTouched: false,
  }
}

function draftFromRule(r: CustomRule, sample: string): Draft {
  const d = { ...emptyDraft(), name: r.name, description: r.description ?? '', severity: r.severity,
    is_active: r.is_active, kind: r.kind, sample, sampleTouched: false }
  const c = r.config as any
  if (r.kind === 'keywords') Object.assign(d, { words: c.words ?? [], kwCase: !!c.case_sensitive, kwWhole: !!c.whole_word })
  if (r.kind === 'prefix') Object.assign(d, { prefix: c.prefix ?? '', charset: c.charset ?? 'alnum',
    minLen: String(c.min_length ?? ''), maxLen: String(c.max_length ?? '') })
  if (r.kind === 'pattern') d.template = c.template ?? ''
  if (r.kind === 'regex') Object.assign(d, { regex: c.pattern ?? '', rxCase: !!c.case_sensitive })
  return d
}

/** Configuration from the draft; null = still incomplete (no preview request). */
function buildConfig(d: Draft): CustomRuleConfig | null {
  switch (d.kind) {
    case 'keywords':
      return d.words.length ? { words: d.words, case_sensitive: d.kwCase, whole_word: d.kwWhole } : null
    case 'prefix': {
      const min = parseInt(d.minLen, 10), max = parseInt(d.maxLen, 10)
      if (!d.prefix || Number.isNaN(min) || Number.isNaN(max)) return null
      return { prefix: d.prefix, charset: d.charset, min_length: min, max_length: max }
    }
    case 'pattern':
      return d.template ? { template: d.template } : null
    case 'regex':
      return d.regex ? { pattern: d.regex, case_sensitive: d.rxCase } : null
    default:
      return null
  }
}

// Example values for the live hints
const CHARSET_POOL: Record<PrefixCharset, string> = {
  alnum: 'a7Kq2Xm9Pz4Rt8Lw3Nc6Vb1Hs5Jd0Fg',
  hex: '9f3a07c4e1b86d25',
  base64url: 'Zq4-Xm_9Pz4Rt8Lw3N-c6Vb1_Hs5Jd0',
  digits: '4711080915926535',
}
function exampleToken(prefix: string, charset: PrefixCharset, len: number) {
  const pool = CHARSET_POOL[charset]
  let s = ''
  for (let i = 0; i < Math.min(Math.max(len, 0), 40); i++) s += pool[i % pool.length]
  return prefix + s + (len > 40 ? '…' : '')
}
function exampleFromTemplate(tpl: string) {
  const digits = '0047118150', upper = 'KDXQ', lower = 'abcx', any = 'x7Q2'
  let out = '', i = 0
  for (let p = 0; p < tpl.length; p++) {
    const c = tpl[p]
    if (c === '\\' && p + 1 < tpl.length) { out += tpl[++p]; continue }
    if (c === '#') out += digits[i++ % digits.length]
    else if (c === 'A') out += upper[i++ % upper.length]
    else if (c === 'a') out += lower[i++ % lower.length]
    else if (c === '*') out += any[i++ % any.length]
    else out += c
  }
  return out
}

type Preview =
  | { status: 'incomplete' }
  | { status: 'loading' }
  | { status: 'ok'; pattern: string; flags: string; re: RegExp }
  | { status: 'invalid'; error: string }

function usePreview(kind: CustomRuleKind | null, config: CustomRuleConfig | null, t: (k: string) => string): Preview {
  const [state, setState] = useState<Preview>({ status: 'incomplete' })
  const seq = useRef(0)
  const key = kind && config ? JSON.stringify([kind, config]) : ''

  useEffect(() => {
    const my = ++seq.current
    if (!kind || !config) { setState({ status: 'incomplete' }); return }
    setState({ status: 'loading' })
    const timer = setTimeout(() => {
      customRules.preview(kind, config)
        .then(res => {
          if (my !== seq.current) return
          try {
            // The extension compiles the same way in the browser – what fails here fails there too
            const flags = res.flags.includes('g') ? res.flags : res.flags + 'g'
            setState({ status: 'ok', pattern: res.pattern, flags: res.flags, re: new RegExp(res.pattern, flags) })
          } catch {
            setState({ status: 'invalid', error: t('crule_err_browser_regex') })
          }
        })
        .catch((e: any) => {
          if (my === seq.current) setState({ status: 'invalid', error: e?.message || t('crule_err_preview') })
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [key])

  return state
}

/** Matches in the sample text as React nodes (no innerHTML). */
function highlight(text: string, re: RegExp, color: string): { nodes: ReactNode[]; count: number } {
  const nodes: ReactNode[] = []
  let last = 0, count = 0
  re.lastIndex = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (!m[0].length) continue
    if (start > last) nodes.push(text.slice(last, start))
    nodes.push(
      <mark key={start} style={{ background: `color-mix(in srgb, ${color} 26%, transparent)`,
        color: 'var(--text)', borderRadius: 3, padding: '0 1px',
        boxShadow: `inset 0 -1px 0 ${color}` }}>{m[0]}</mark>,
    )
    last = start + m[0].length
    if (++count >= 500) break
  }
  if (last < text.length) nodes.push(text.slice(last))
  return { nodes, count }
}

export default function CustomRules() {
  const { t, lang } = useLang()
  const [rules, setRules]       = useState<CustomRule[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')
  const [editing, setEditing]   = useState<{ id: string | null } | null>(null)
  const [draft, setDraft]       = useState<Draft>(emptyDraft)
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [busyId, setBusyId]     = useState<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const load = () => customRules.list()
    .then(r => { setRules(r); setCustomRuleCache(r) })
    .catch((e: any) => setError(e?.message || t('load_failed')))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))
  const sampleFor = (k: CustomRuleKind) => t('crule_sample_' + k)

  const chooseKind = (k: CustomRuleKind) => setDraft(d => ({
    ...d, kind: k, sample: d.sampleTouched ? d.sample : sampleFor(k),
  }))

  const openNew = () => {
    setEditing({ id: null }); setDraft(emptyDraft()); setNotice(''); setError('')
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }))
  }
  const openEdit = (r: CustomRule) => {
    setEditing({ id: r.id }); setDraft(draftFromRule(r, sampleFor(r.kind))); setNotice(''); setError('')
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }))
  }
  const close = () => { setEditing(null); setDraft(emptyDraft()) }

  const config  = useMemo(() => buildConfig(draft), [draft])
  const preview = usePreview(draft.kind, config, t)
  const canSave = !!draft.name.trim() && preview.status === 'ok' && !saving

  const save = async () => {
    if (!canSave || !draft.kind || !config || !editing) return
    setSaving(true); setError('')
    const body: CustomRuleInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      kind: draft.kind, config, severity: draft.severity, is_active: draft.is_active,
    }
    try {
      if (editing.id) await customRules.update(editing.id, body)
      else await customRules.create(body)
      setNotice(t(editing.id ? 'crule_saved' : 'crule_created', { name: body.name }))
      close()
      await load()
    } catch (e: any) {
      setError(e?.message || t('crule_err_save'))
    } finally {
      setSaving(false)
    }
  }

  const toInput = (r: CustomRule, patch: Partial<CustomRuleInput> = {}): CustomRuleInput => ({
    name: r.name, description: r.description, kind: r.kind, config: r.config,
    severity: r.severity, is_active: r.is_active, ...patch,
  })

  const toggleActive = async (r: CustomRule) => {
    setBusyId(r.id); setError('')
    try {
      const updated = await customRules.update(r.id, toInput(r, { is_active: !r.is_active }))
      setRules(list => list.map(x => x.id === r.id ? { ...x, ...(updated ?? {}), is_active: !r.is_active } : x))
    } catch (e: any) {
      setError(e?.message || t('crule_err_save'))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (r: CustomRule) => {
    setBusyId(r.id); setError('')
    try {
      await customRules.delete(r.id)
      setConfirmDel(null)
      if (editing?.id === r.id) close()
      const next = rules.filter(x => x.id !== r.id)
      setRules(next); setCustomRuleCache(next)
    } catch (e: any) {
      setError(e?.message || t('crule_err_delete'))
    } finally {
      setBusyId(null)
    }
  }

  const atLimit = rules.length >= MAX_RULES
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang, { dateStyle: 'medium' })

  return (
    <div style={{ maxWidth: 1040 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <h1 style={{ fontSize: 16, fontWeight: 500 }}>{t('crule_h1')}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6, maxWidth: 720 }}>
            {t('crule_subtitle')}
          </p>
        </div>
        {!editing && (
          <Btn onClick={openNew} disabled={atLimit} type="button"
            title={atLimit ? t('crule_limit_reached', { max: MAX_RULES }) : undefined}>
            <Plus size={14} />{t('crule_new')}
          </Btn>
        )}
      </div>

      {notice && <div style={{ marginBottom: 12 }}><Alert type="success">{notice}</Alert></div>}
      {error && <div style={{ marginBottom: 12 }} role="alert"><Alert>{error}</Alert></div>}

      {editing && (
        <div ref={editorRef} style={{ marginBottom: 16, scrollMarginTop: 64 }}>
          <Editor key={editing.id ?? 'new'}
            t={t} draft={draft} set={set} chooseKind={chooseKind}
            isNew={!editing.id} preview={preview}
            canSave={canSave} saving={saving} onSave={save} onCancel={close}
          />
        </div>
      )}

      <Card title={`${t('crule_list_title')} · ${rules.length}`}
        action={<span style={{ fontSize: 11, color: 'var(--text-hint)', fontVariantNumeric: 'tabular-nums' }}>
          {t('crule_limit_meta', { n: rules.length, max: MAX_RULES })}
        </span>}
        style={{ overflow: 'visible' }}>
        {loading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('loading_short')}</div>}

        {!loading && rules.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 640 }}>
            <div style={{ color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>{t('crule_empty_title')}</div>
            <p>{t('crule_empty_text')}</p>
            <ul style={{ margin: '8px 0 12px 18px', color: 'var(--text-muted)' }}>
              <li>{t('crule_empty_ex1')}</li>
              <li>{t('crule_empty_ex2')}</li>
              <li>{t('crule_empty_ex3')}</li>
            </ul>
            {!editing && <Btn size="sm" type="button" onClick={openNew}><Plus size={13} />{t('crule_create_first')}</Btn>}
          </div>
        )}

        {rules.length > 0 && (
          <div style={{ overflowX: 'auto', margin: '-16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={th}>{t('crule_col_name')}</th>
                  <th style={th}>{t('crule_col_kind')}</th>
                  <th style={th}>{t('col_severity')}</th>
                  <th style={th}>{t('crule_col_active')}</th>
                  <th style={th}>{t('crule_col_updated')}</th>
                  <th style={{ ...th, textAlign: 'right' }} aria-label={t('crule_col_actions')} />
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.6,
                    background: editing?.id === r.id ? 'var(--bg-elevated)' : undefined }}>
                    <td style={td}>
                      <div style={{ color: 'var(--text)' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>
                        <code>{r.rule_id}</code>
                        {r.description && <> · {r.description}</>}
                      </div>
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('crule_kind_' + r.kind)}</td>
                    <td style={td}><Badge color={SEV_COLOR[r.severity]}>{t('sev_' + r.severity)}</Badge></td>
                    <td style={td}>
                      <Switch checked={r.is_active} disabled={busyId === r.id}
                        label={t('crule_toggle_active', { name: r.name })}
                        onChange={() => toggleActive(r)} />
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDate(r.updated_at || r.created_at)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirmDel === r.id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('crule_confirm_delete')}</span>
                          <Btn size="sm" variant="danger" type="button" disabled={busyId === r.id}
                            onClick={() => remove(r)}>{t('delete')}</Btn>
                          <Btn size="sm" variant="ghost" type="button" onClick={() => setConfirmDel(null)}>{t('crule_cancel')}</Btn>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 2 }}>
                          <button type="button" style={iconBtn} onClick={() => openEdit(r)}
                            title={t('crule_edit')} aria-label={`${t('crule_edit')}: ${r.name}`}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" style={{ ...iconBtn, color: 'var(--sev-critical)' }}
                            onClick={() => setConfirmDel(r.id)}
                            title={t('delete')} aria-label={`${t('delete')}: ${r.name}`}>
                            <Trash2 size={14} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────

type T = (key: string, vars?: Record<string, string | number>) => string

function Editor({ t, draft, set, chooseKind, isNew, preview, canSave, saving, onSave, onCancel }: {
  t: T
  draft: Draft
  set: (p: Partial<Draft>) => void
  chooseKind: (k: CustomRuleKind) => void
  isNew: boolean
  preview: Preview
  canSave: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const [picking, setPicking] = useState(draft.kind === null)
  const kind = draft.kind

  const title = isNew ? t('crule_editor_new') : t('crule_editor_edit')
  const closeBtn = (
    <button type="button" onClick={onCancel} style={iconBtn} title={t('crule_cancel')} aria-label={t('crule_cancel')}>
      <X size={14} />
    </button>
  )

  if (picking || !kind) {
    return (
      <Card title={title} subtitle={t('crule_step1')} action={closeBtn}>
        <div role="radiogroup" aria-label={t('crule_step1')}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {KINDS.map(({ kind: k, icon: Icon }) => {
            const selected = draft.kind === k
            return (
              <button key={k} type="button" role="radio" aria-checked={selected}
                onClick={() => { chooseKind(k); setPicking(false) }}
                style={{
                  textAlign: 'left', padding: 14, cursor: 'pointer', fontFamily: 'inherit',
                  background: selected ? 'var(--bg-elevated)' : 'transparent',
                  border: `1px solid ${selected ? 'var(--border-strong)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)', color: 'var(--text)',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
                  <Icon size={14} color="var(--text-muted)" />{t('crule_kind_' + k)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('crule_kind_' + k + '_desc')}</span>
                <code style={{ fontSize: 11.5, color: 'var(--text-hint)' }}>{t('crule_kind_' + k + '_example')}</code>
              </button>
            )
          })}
        </div>
      </Card>
    )
  }

  const hint = saveHint(t, draft, preview)

  return (
    <Card title={title} subtitle={t('crule_step2', { kind: t('crule_kind_' + kind) })}
      action={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Btn size="sm" variant="ghost" type="button" onClick={() => setPicking(true)}>{t('crule_change_kind')}</Btn>
        {closeBtn}
      </span>}>
      <form onSubmit={e => { e.preventDefault(); onSave() }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* Left: definition */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div>
              <label htmlFor="cr-name" style={labelStyle}>{t('crule_name')}</label>
              <input id="cr-name" style={inputStyle} value={draft.name} maxLength={80} required
                placeholder={t('crule_name_placeholder_' + kind)}
                onChange={e => set({ name: e.target.value })} />
            </div>

            {kind === 'keywords' && <KeywordsForm t={t} draft={draft} set={set} />}
            {kind === 'prefix' && <PrefixForm t={t} draft={draft} set={set} />}
            {kind === 'pattern' && <PatternForm t={t} draft={draft} set={set} />}
            {kind === 'regex' && <RegexForm t={t} draft={draft} set={set} />}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="cr-sev" style={labelStyle}>{t('col_severity')}</label>
                <select id="cr-sev" style={inputStyle} value={draft.severity}
                  onChange={e => set({ severity: e.target.value as Severity })}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{t('sev_' + s)}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                <Switch checked={draft.is_active} label={t('crule_active')} onChange={() => set({ is_active: !draft.is_active })} />
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {draft.is_active ? t('crule_active') : t('crule_inactive')}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: -8 }}>{t('crule_severity_hint')}</div>

            <div>
              <label htmlFor="cr-desc" style={labelStyle}>{t('crule_description')}</label>
              <textarea id="cr-desc" rows={2} style={{ ...inputStyle, resize: 'vertical' }} maxLength={200}
                value={draft.description} placeholder={t('crule_description_placeholder')}
                onChange={e => set({ description: e.target.value })} />
            </div>
          </div>

          {/* Right: live test */}
          <Tester t={t} draft={draft} set={set} preview={preview} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, paddingTop: 14,
          borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Btn type="submit" disabled={!canSave}>{saving ? '…' : isNew ? t('crule_create') : t('crule_save')}</Btn>
          <Btn type="button" variant="secondary" onClick={onCancel}>{t('crule_cancel')}</Btn>
          {hint && <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>{hint}</span>}
        </div>
      </form>
    </Card>
  )
}

function saveHint(t: T, d: Draft, p: Preview): string {
  if (p.status === 'incomplete') return t('crule_hint_incomplete_' + d.kind)
  if (p.status === 'invalid') return t('crule_hint_fix')
  if (p.status === 'loading') return t('crule_checking')
  if (!d.name.trim()) return t('crule_hint_name')
  return ''
}

function KeywordsForm({ t, draft, set }: { t: T; draft: Draft; set: (p: Partial<Draft>) => void }) {
  const [text, setText] = useState('')
  const full = draft.words.length >= MAX_WORDS

  const commit = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map(s => s.slice(0, 64))
    if (!parts.length) return
    const seen = new Set(draft.words.map(w => w.toLowerCase()))
    const next = [...draft.words]
    for (const p of parts) {
      if (next.length >= MAX_WORDS) break
      if (!seen.has(p.toLowerCase())) { next.push(p); seen.add(p.toLowerCase()) }
    }
    set({ words: next })
  }

  return (
    <div>
      <label htmlFor="cr-words" style={labelStyle}>{t('crule_words')}</label>
      <input id="cr-words" style={inputStyle} value={text} maxLength={64 * MAX_WORDS} disabled={full}
        placeholder={full ? t('crule_words_full', { max: MAX_WORDS }) : t('crule_words_placeholder')}
        aria-describedby="cr-words-hint"
        onChange={e => {
          const v = e.target.value
          if (v.includes(',')) { commit(v); setText('') } else setText(v)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); setText('') }
          if (e.key === 'Backspace' && !text && draft.words.length) set({ words: draft.words.slice(0, -1) })
        }}
        onBlur={() => { commit(text); setText('') }}
        onPaste={e => {
          const v = e.clipboardData.getData('text')
          if (/[,\n]/.test(v)) { e.preventDefault(); commit(text + v); setText('') }
        }} />
      <div id="cr-words-hint" style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>
        {t('crule_words_hint', { n: draft.words.length, max: MAX_WORDS })}
      </div>
      {draft.words.length > 0 && (
        <ul aria-label={t('crule_words')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, listStyle: 'none', padding: 0 }}>
          {draft.words.map((w, i) => (
            <li key={w + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 4,
              fontSize: 12, color: 'var(--text)', maxWidth: '100%' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w}</span>
              <button type="button" onClick={() => set({ words: draft.words.filter((_, j) => j !== i) })}
                aria-label={t('crule_word_remove', { word: w })} title={t('crule_word_remove', { word: w })}
                style={{ ...iconBtn, width: 18, height: 18 }}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <Check label={t('crule_whole_word')} hint={t('crule_whole_word_hint')} checked={draft.kwWhole}
          onChange={v => set({ kwWhole: v })} />
        <Check label={t('crule_case_sensitive')} checked={draft.kwCase} onChange={v => set({ kwCase: v })} />
      </div>
    </div>
  )
}

function PrefixForm({ t, draft, set }: { t: T; draft: Draft; set: (p: Partial<Draft>) => void }) {
  const min = parseInt(draft.minLen, 10)
  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px' }}>
          <label htmlFor="cr-prefix" style={labelStyle}>{t('crule_prefix')}</label>
          <input id="cr-prefix" style={{ ...inputStyle, fontFamily: MONO }} value={draft.prefix} maxLength={32}
            placeholder="acme_" spellCheck={false} autoComplete="off"
            onChange={e => set({ prefix: e.target.value })} />
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label htmlFor="cr-charset" style={labelStyle}>{t('crule_charset')}</label>
          <select id="cr-charset" style={inputStyle} value={draft.charset}
            onChange={e => set({ charset: e.target.value as PrefixCharset })}>
            {CHARSETS.map(c => <option key={c} value={c}>{t('crule_charset_' + c)}</option>)}
          </select>
        </div>
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelStyle}>{t('crule_length')}</legend>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input aria-label={t('crule_length_min')} type="number" min={4} max={128} inputMode="numeric"
            style={{ ...inputStyle, width: 90, fontVariantNumeric: 'tabular-nums' }} value={draft.minLen}
            onChange={e => set({ minLen: e.target.value })} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('crule_length_to')}</span>
          <input aria-label={t('crule_length_max')} type="number" min={4} max={256} inputMode="numeric"
            style={{ ...inputStyle, width: 90, fontVariantNumeric: 'tabular-nums' }} value={draft.maxLen}
            onChange={e => set({ maxLen: e.target.value })} />
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('crule_length_unit')}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>{t('crule_length_hint')}</div>
      </fieldset>
      {draft.prefix && !Number.isNaN(min) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('crule_example_match')} <code style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
            {exampleToken(draft.prefix, draft.charset, min)}</code>
        </div>
      )}
    </>
  )
}

const TEMPLATE_TOKENS = ['#', 'A', 'a', '*'] as const

function PatternForm({ t, draft, set }: { t: T; draft: Draft; set: (p: Partial<Draft>) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const insert = (tok: string) => {
    const el = ref.current
    const v = draft.template
    const s = el?.selectionStart ?? v.length, e = el?.selectionEnd ?? v.length
    const next = (v.slice(0, s) + tok + v.slice(e)).slice(0, 64)
    set({ template: next })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length) })
  }
  return (
    <div>
      <label htmlFor="cr-template" style={labelStyle}>{t('crule_template')}</label>
      <input id="cr-template" ref={ref} style={{ ...inputStyle, fontFamily: MONO }} value={draft.template}
        maxLength={64} placeholder="KD-######" spellCheck={false} autoComplete="off"
        aria-describedby="cr-template-legend"
        onChange={e => set({ template: e.target.value })} />
      <div id="cr-template-legend" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 6, marginTop: 8 }}>
        {TEMPLATE_TOKENS.map(tok => (
          <button key={tok} type="button" onClick={() => insert(tok)}
            title={t('crule_insert_token', { token: tok })}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              color: 'var(--text-muted)', fontSize: 12, textAlign: 'left', fontFamily: 'inherit' }}>
            <code style={{ color: 'var(--text)', minWidth: 12 }}>{tok}</code>{t('crule_token_' + tokenKey(tok))}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.5 }}>
        {t('crule_template_escape')}
      </div>
      {draft.template && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {t('crule_example_match')} <code style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
            {exampleFromTemplate(draft.template)}</code>
        </div>
      )}
    </div>
  )
}
const tokenKey = (tok: string) => ({ '#': 'digit', A: 'upper', a: 'lower', '*': 'any' } as Record<string, string>)[tok]

function RegexForm({ t, draft, set }: { t: T; draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div>
      <label htmlFor="cr-regex" style={labelStyle}>{t('crule_regex')}</label>
      <textarea id="cr-regex" rows={3} maxLength={512} spellCheck={false} autoComplete="off"
        style={{ ...inputStyle, fontFamily: MONO, fontSize: 12.5, resize: 'vertical' }}
        value={draft.regex} placeholder={'\\bPRJ-\\d{4}\\b'}
        onChange={e => set({ regex: e.target.value })} />
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.5 }}>{t('crule_regex_hint')}</div>
      <div style={{ marginTop: 8 }}>
        <Check label={t('crule_case_sensitive')} checked={draft.rxCase} onChange={v => set({ rxCase: v })} />
      </div>
    </div>
  )
}

function Tester({ t, draft, set, preview }: { t: T; draft: Draft; set: (p: Partial<Draft>) => void; preview: Preview }) {
  const color = SEV_COLOR[draft.severity]
  const result = useMemo(
    () => preview.status === 'ok' ? highlight(draft.sample, preview.re, color) : null,
    [preview, draft.sample, color],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div>
        <label htmlFor="cr-sample" style={labelStyle}>{t('crule_tester')}</label>
        <textarea id="cr-sample" rows={4} maxLength={SAMPLE_MAX} style={{ ...inputStyle, resize: 'vertical' }}
          value={draft.sample} onChange={e => set({ sample: e.target.value, sampleTouched: true })} />
        <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>{t('crule_tester_hint')}</div>
      </div>

      <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        {preview.status === 'ok' && result && (
          <Badge color={result.count ? color : 'var(--sev-low)'}>
            {result.count === 1 ? t('crule_match_one') : t('crule_match_n', { n: result.count })}
          </Badge>
        )}
        {preview.status === 'loading' && <span style={{ color: 'var(--text-hint)' }}>{t('crule_checking')}</span>}
        {preview.status === 'incomplete' && <span style={{ color: 'var(--text-hint)' }}>{t('crule_hint_incomplete_' + draft.kind)}</span>}
      </div>

      {preview.status === 'invalid' && <Alert>{preview.error}</Alert>}

      <div style={{ padding: '10px 12px', minHeight: 72, background: 'var(--bg-canvas)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-muted)' }}>
        {result ? result.nodes : draft.sample}
      </div>

      {preview.status === 'ok' && (
        <details>
          <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>{t('crule_show_regex')}</summary>
          <code style={{ display: 'block', marginTop: 6, padding: '8px 10px', background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
            /{preview.pattern}/{preview.flags}
          </code>
        </details>
      )}
    </div>
  )
}

// ── Small building blocks ─────────────────────────────────────────

function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: () => void; label: string; disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label}
      disabled={disabled} onClick={onChange}
      style={{
        position: 'relative', width: 30, height: 17, flexShrink: 0, padding: 0, borderRadius: 9,
        cursor: disabled ? 'wait' : 'pointer',
        background: checked ? 'color-mix(in srgb, var(--text) 24%, var(--bg-elevated))' : 'var(--bg-elevated)',
        border: `1px solid ${checked ? 'color-mix(in srgb, var(--text) 40%, transparent)' : 'var(--border-strong)'}`,
        transition: 'background .15s',
      }}>
      <span aria-hidden="true" style={{
        position: 'absolute', top: 2, left: checked ? 15 : 2, width: 11, height: 11, borderRadius: '50%',
        background: checked ? 'var(--text)' : 'var(--text-muted)', transition: 'left .15s',
      }} />
    </button>
  )
}

function Check({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        {label}
        {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-hint)' }}>{hint}</span>}
      </span>
    </label>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, padding: 0,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
}
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 16px', fontSize: 11, fontWeight: 400, color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '10px 16px', borderBottom: '1px solid var(--bg-elevated)', verticalAlign: 'middle',
}
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, padding: 0, background: 'none', border: 'none',
  borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer',
}
