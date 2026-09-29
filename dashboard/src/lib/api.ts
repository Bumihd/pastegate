// API client – all requests against the FastAPI backend
// With timeout, retry logic for 5xx, clean 401 handling and network error recovery.

import { FALLBACK_LANG, isLang, makeT } from './i18n'
import type { CustomRule, CustomRuleInput, CustomRuleKind, CustomRuleConfig } from '../types'

const BASE = '/api/v1'

// Configuration
const REQUEST_TIMEOUT_MS = 15000        // 15s timeout per request
const RETRY_ATTEMPTS     = 2            // 1 initial attempt + 2 retries = 3 attempts on 5xx/network
const RETRY_DELAY_MS     = 800          // Base delay; doubles with each retry
const NON_RETRY_METHODS  = new Set(['POST', 'DELETE', 'PATCH'])  // retry mutating methods only on pure network errors

function getToken(): string | null {
  return localStorage.getItem('pg_token')
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * A single fetch attempt with a timeout via AbortController.
 * Throws on network error or timeout.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Active dashboard language → backend returns error messages in this language
let requestLang = 'en'
export function setRequestLang(lang: string) { requestLang = lang }

// Translated client error messages in the active dashboard language
function tr(key: string, vars?: Record<string, string | number>): string {
  return makeT(isLang(requestLang) ? requestLang : FALLBACK_LANG)(key, vars)
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token  = getToken()
  const method = (opts.method || 'GET').toUpperCase()
  const url    = `${BASE}${path}`
  const init: RequestInit = {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': requestLang,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init)

      // 401: token expired or invalid → log out. On the login request itself,
      // 401 means wrong credentials – handled by the generic 4xx branch below.
      if (res.status === 401 && !path.startsWith('/auth/login')) {
        localStorage.removeItem('pg_token')
        // Avoid a redirect loop if we are already on /login
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        throw new Error(tr('err_session_expired'))
      }

      // 5xx: retry GET, but not mutating methods (idempotency!)
      if (res.status >= 500 && res.status < 600) {
        if (!NON_RETRY_METHODS.has(method) && attempt < RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt))
          continue
        }
        throw new Error(tr('err_server', { status: res.status }))
      }

      // 429: rate limit — honor the Retry-After header if present
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10)
        const detail = await res.json().catch(() => ({ detail: tr('err_too_many_requests') }))
        const err: any = new Error(detail.detail || tr('err_too_many_requests'))
        err.status = 429
        err.retryAfter = retryAfter
        throw err
      }

      // Other 4xx: extract a meaningful error message
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { detail?: string }))
        // Validation errors (422) return detail as a list – use a generic message then
        throw new Error(typeof err.detail === 'string' ? err.detail : tr('err_request_failed', { status: res.status }))
      }

      // Success
      if (res.status === 204) return undefined as T
      return await res.json()

    } catch (e: any) {
      // AbortError or real network error → retry if attempts remain
      const isNetworkError = e?.name === 'AbortError'
        || e?.message === 'Failed to fetch'
        || e?.message?.includes('NetworkError')
        || e?.message?.includes('network')

      if (isNetworkError && attempt < RETRY_ATTEMPTS) {
        lastError = new Error(tr('err_connection_failed'))
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      // Network error after all retries → translated message instead of browser text
      if (isNetworkError) throw new Error(tr('err_connection_failed'))
      // Known HTTP error → rethrow
      throw e instanceof Error ? e : new Error(String(e))
    }
  }

  throw lastError || new Error(tr('err_connection_failed'))
}

// ── Auth ──────────────────────────────────────────────────────────

export const auth = {
  login: (username: string, password: string, totp_code?: string) =>
    request<{ access_token: string; role: string; totp_required: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, totp_code }),
    }),

  me: () => request<{ username: string; email: string; role: string; totp_enabled: boolean }>('/auth/me'),

  // Revokes the current JWT server-side
  logout: () => request('/auth/logout', { method: 'POST' }).catch(() => {}),

  changePassword: (current_password: string, new_password: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // TOTP-2FA (post-auth)
  totpSetup: () =>
    request<{ secret: string; qr_uri: string; qr_image: string }>('/auth/totp/setup', { method: 'POST' }),
  totpConfirm: (totp_code: string) =>
    request('/auth/totp/confirm', { method: 'POST', body: JSON.stringify({ totp_code }) }),
}

// ── Events ────────────────────────────────────────────────────────

export const events = {
  list: (params?: { limit?: number; offset?: number; severity?: string; action?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return request<{ items: any[]; total: number }>(`/admin/events?${q}`)
  },
  stats: () => request<any>('/admin/stats'),
}

// ── Devices ───────────────────────────────────────────────────────

export const devices = {
  list: () => request<any[]>('/admin/devices'),
  // Real name – itsec/infosec only, every lookup is recorded in the audit log
  identity: (id: string) =>
    request<{ device_hash: string; identity: string | null }>(`/admin/devices/${id}/identity`, { method: 'POST' }),
}

// ── Domain-Rules ──────────────────────────────────────────────────

export const domainRules = {
  list: () => request<any[]>('/admin/domain-rules'),
  create: (pattern: string, mode: string) =>
    request('/admin/domain-rules', {
      method: 'POST',
      body: JSON.stringify({ pattern, mode }),
    }),
  delete: (id: string) =>
    request(`/admin/domain-rules/${id}`, { method: 'DELETE' }),
}

// ── Custom detection rules ────────────────────────────────────────

export const customRules = {
  list: () => request<CustomRule[]>('/admin/custom-rules'),
  create: (body: CustomRuleInput) =>
    request<CustomRule>('/admin/custom-rules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<CustomRuleInput>) =>
    request<CustomRule>(`/admin/custom-rules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request(`/admin/custom-rules/${id}`, { method: 'DELETE' }),
  // Compiles the configuration server-side; 422 → Error with the translated detail message
  preview: (kind: CustomRuleKind, config: CustomRuleConfig) =>
    request<{ pattern: string; flags: string }>('/admin/custom-rules/preview', {
      method: 'POST', body: JSON.stringify({ kind, config }),
    }),
}

// ── Meta (public) ─────────────────────────────────────────────────

export const meta = {
  get: () => request<{ default_lang: string; languages: string[] }>('/meta'),
}

// ── Organization settings ─────────────────────────────────────────

export const orgSettings = {
  get: () => request<{ default_lang: string }>('/admin/settings'),
  update: (body: { default_lang: string }) =>
    request<{ default_lang: string }>('/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),
}

// ── API-Keys ──────────────────────────────────────────────────────

export const apiKeys = {
  list: () => request<any[]>('/admin/api-keys'),
  create: (name: string) =>
    request<{ key: string; id: string }>('/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revoke: (id: string) =>
    request(`/admin/api-keys/${id}`, { method: 'DELETE' }),
}

// ── Personal API tokens (reporting API /data/*) ───────────────────

export interface AccessTokenRow {
  id: string
  name: string
  is_active: boolean
  created_at: string
  last_used: string | null
  expires_at: string | null
}

export const accessTokens = {
  list: () => request<AccessTokenRow[]>('/tokens'),
  create: (name: string, expires_in_days: number | null) =>
    request<AccessTokenRow & { token: string }>('/tokens', {
      method: 'POST',
      body: JSON.stringify({ name, expires_in_days }),
    }),
  revoke: (id: string) =>
    request(`/tokens/${id}`, { method: 'DELETE' }),
}

// ── Extension-Builder ─────────────────────────────────────────────

export const extensionBuilder = {
  build: async (lang: string, key_id: string, server_url?: string, replace_previous = false): Promise<Blob> => {
    const token = getToken()
    const body: any = { lang, key_id, replace_previous }
    if (server_url) body.server_url = server_url

    const res = await fetch(`${BASE}/admin/build-extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': requestLang,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: tr('build_failed') }))
      throw new Error(err.detail || tr('build_failed'))
    }
    return res.blob()
  },
}

// ── Audit-Log ─────────────────────────────────────────────────────

export const audit = {
  list: () => request<any[]>('/admin/audit-log'),
}

// ── Users ─────────────────────────────────────────────────────────

export const users = {
  list: () => request<any[]>('/admin/users'),
  create: (body: { username: string; email: string; password: string; role: string }) =>
    request<{ id: string; username: string; role: string }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deactivate: (id: string) =>
    request(`/admin/users/${id}/deactivate`, { method: 'POST' }),
}

// ── Viewer ────────────────────────────────────────────────────────

export const viewer = {
  events: () => request<{ items: any[] }>('/admin/viewer/events'),
}

// ── Viewer device assignments ─────────────────────────────────────

export const viewerAssignments = {
  list: () => request<any[]>('/admin/viewer-assignments'),
  create: (body: { user_id: string; device_id: string; note?: string }) =>
    request<any>('/admin/viewer-assignments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    request(`/admin/viewer-assignments/${id}`, { method: 'DELETE' }),
}

// ── Setup-Wizard ──────────────────────────────────────────────────
// Separate fetch helper WITHOUT the global 401 redirect: a wrong setup token
// returns 401 but must not send the user to /login.

async function setupReq<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/setup${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': requestLang },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { detail?: string }))
    const e: any = new Error(err.detail || tr('err_request_failed', { status: res.status }))
    e.status = res.status
    throw e
  }
  return res.status === 204 ? (undefined as T) : await res.json()
}

export const setupApi = {
  status:      () => setupReq<{ needs_setup: boolean; has_admin: boolean }>('/status'),
  verifyToken: (token: string) =>
    setupReq<{ valid: boolean; has_admin: boolean }>('/verify-token', { token }),
  createAdmin: (token: string, username: string, email: string, password: string) =>
    setupReq<{ id: string; username: string; role: string }>('/create-admin', { token, username, email, password }),
  initTotp:    (token: string) => setupReq<{ secret: string; qr_uri: string; qr_image: string }>('/init-totp', { token }),
  confirmTotp: (token: string, totp_code: string) =>
    setupReq<{ totp_enabled: boolean }>('/confirm-totp', { token, totp_code }),
  initApiKey:  (token: string, name: string) => setupReq<{ key: string }>('/init-apikey', { token, name }),
  settings:    (token: string, default_lang: string) =>
    setupReq<{ default_lang: string }>('/settings', { token, default_lang }),
  complete:    (token: string) => setupReq<{ ok: boolean }>('/complete', { token }),
}
