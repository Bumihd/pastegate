// Sprachunabhängige Endpoint-Definitionen der API-Doku.
// Die Texte (Beschreibung, Feld-Erklärungen) liegen in den Sprachdateien und sind
// über `id` bzw. die Feldnamen in `body`/`query` zugeordnet – der Typ `ApiDoc`
// erzwingt, dass jede Sprache genau diese Endpoints und Felder beschreibt.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type Auth = 'public' | 'api-key' | 'jwt' | 'token'

export const API_SECTIONS = [
  {
    id: 'health',
    endpoints: [
      { id: 'ping', method: 'GET', path: '/api/v1/ping', auth: 'public',
        response: '{ "pong": true }' },
      { id: 'healthz', method: 'GET', path: '/api/v1/healthz', auth: 'public',
        response: '{ "status": "ok", "version": "…", "db": { "ok": true, "latency_ms": 1.2 } }' },
      { id: 'meta', method: 'GET', path: '/api/v1/meta', auth: 'public',
        response: '{ "default_lang": "en", "languages": ["de", "en", "fr", "es"] }' },
      { id: 'health_key', method: 'GET', path: '/api/v1/health', auth: 'api-key',
        response: '{ "status": "ok" }' },
      { id: 'config', method: 'GET', path: '/api/v1/config', auth: 'api-key',
        response: '{\n  "domain_rules": [{ "pattern": "*.chatgpt.com", "mode": "hard_block" }],\n  "default_lang": "en"\n}' },
    ],
  },
  {
    id: 'events',
    endpoints: [
      { id: 'events_batch', method: 'POST', path: '/api/v1/events/batch', auth: 'api-key',
        body: ['device_id', 'events', 'events[].ts', 'events[].url_hash', 'events[].host',
               'events[].action', 'events[].findings'],
        response: '202 Accepted\n{ "accepted": 3 }' },
    ],
  },
  {
    id: 'setup',
    endpoints: [
      { id: 'setup_settings', method: 'POST', path: '/api/v1/setup/settings', auth: 'public',
        body: ['token', 'default_lang'],
        response: '{ "default_lang": "fr" }' },
    ],
  },
  {
    id: 'auth',
    endpoints: [
      { id: 'login', method: 'POST', path: '/api/v1/auth/login', auth: 'public',
        body: ['username', 'password', 'totp_code'],
        response: '{ "access_token": "eyJ...", "role": "admin", "totp_required": false }' },
      { id: 'logout', method: 'POST', path: '/api/v1/auth/logout', auth: 'jwt',
        response: '204 No Content' },
      { id: 'me', method: 'GET', path: '/api/v1/auth/me', auth: 'jwt',
        response: '{ "username": "admin", "email": "...", "role": "admin", "totp_enabled": false }' },
      { id: 'change_password', method: 'POST', path: '/api/v1/auth/change-password', auth: 'jwt',
        body: ['current_password', 'new_password'],
        response: '204 No Content' },
      { id: 'totp_setup', method: 'POST', path: '/api/v1/auth/totp/setup', auth: 'jwt',
        response: '{ "secret": "BASE32...", "qr_uri": "otpauth://...", "qr_image": "data:image/svg+xml;base64,..." }' },
      { id: 'totp_confirm', method: 'POST', path: '/api/v1/auth/totp/confirm', auth: 'jwt',
        body: ['totp_code'],
        response: '{ "totp_enabled": true }' },
    ],
  },
  {
    id: 'settings',
    endpoints: [
      { id: 'settings_get', method: 'GET', path: '/api/v1/admin/settings', auth: 'jwt',
        roles: ['admin'],
        response: '{ "default_lang": "en" }' },
      { id: 'settings_put', method: 'PUT', path: '/api/v1/admin/settings', auth: 'jwt',
        roles: ['admin'],
        body: ['default_lang'],
        response: '{ "default_lang": "fr" }' },
    ],
  },
  {
    id: 'stats',
    endpoints: [
      { id: 'stats', method: 'GET', path: '/api/v1/admin/stats', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin', 'management', 'dataprivacy'],
        response: '{ "total_events": 42, "blocked_today": 3, "devices": 5, "trend": [...] }' },
    ],
  },
  {
    id: 'admin_events',
    endpoints: [
      { id: 'admin_events', method: 'GET', path: '/api/v1/admin/events', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin'],
        query: ['limit', 'offset', 'severity', 'action'],
        response: '{\n  "items": [{ "id": "uuid", "ts": "...", "host": "claude.ai", "action": "blocked",\n             "findings": [{ "rule_id": "aws_access_key", "severity": "critical" }] }],\n  "total": 42\n}' },
    ],
  },
  {
    id: 'devices',
    endpoints: [
      { id: 'devices', method: 'GET', path: '/api/v1/admin/devices', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin'],
        response: '[{ "id": "uuid", "device_hash": "a1b2...", "event_count": 12, "has_identity": true }]' },
      { id: 'device_identity', method: 'POST', path: '/api/v1/admin/devices/{id}/identity', auth: 'jwt',
        roles: ['itsec', 'infosec'],
        response: '{ "device_hash": "a1b2...", "identity": "max.mustermann@example.com" }' },
    ],
  },
  {
    id: 'domain_rules',
    endpoints: [
      { id: 'rules_list', method: 'GET', path: '/api/v1/admin/domain-rules', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin'],
        response: '[{ "id": "uuid", "pattern": "*.chatgpt.com", "mode": "hard_block" }]' },
      { id: 'rules_create', method: 'POST', path: '/api/v1/admin/domain-rules', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin'],
        body: ['pattern', 'mode'],
        response: '{ "id": "uuid", "created": true }' },
      { id: 'rules_delete', method: 'DELETE', path: '/api/v1/admin/domain-rules/{id}', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin'],
        response: '204 No Content' },
    ],
  },
  {
    id: 'api_keys',
    endpoints: [
      { id: 'keys_list', method: 'GET', path: '/api/v1/admin/api-keys', auth: 'jwt',
        roles: ['admin'],
        response: '[\n  { "id": "uuid-1", "name": "Sales", "is_active": true, "created_at": "...",\n    "last_used": "...", "parent_id": null },\n  { "id": "uuid-2", "name": "Sales (2026-09-01 08:00 UTC)", "is_active": true, "created_at": "...",\n    "last_used": null, "parent_id": "uuid-1" }\n]' },
      { id: 'keys_create', method: 'POST', path: '/api/v1/admin/api-keys', auth: 'jwt',
        roles: ['admin'],
        body: ['name'],
        response: '201 Created\n{ "id": "uuid", "key": "pg_..." }' },
      { id: 'keys_delete', method: 'DELETE', path: '/api/v1/admin/api-keys/{id}', auth: 'jwt',
        roles: ['admin'],
        response: '204 No Content' },
    ],
  },
  {
    id: 'users',
    endpoints: [
      { id: 'users_list', method: 'GET', path: '/api/v1/admin/users', auth: 'jwt',
        roles: ['admin'],
        response: '[{ "id": "uuid", "username": "admin", "role": "admin", "totp_enabled": true }]' },
      { id: 'users_create', method: 'POST', path: '/api/v1/admin/users', auth: 'jwt',
        roles: ['admin'],
        body: ['username', 'email', 'password', 'role'],
        response: '201 Created\n{ "id": "uuid", "username": "...", "role": "viewer" }' },
      { id: 'users_deactivate', method: 'POST', path: '/api/v1/admin/users/{id}/deactivate', auth: 'jwt',
        roles: ['admin'],
        response: '204 No Content' },
    ],
  },
  {
    id: 'builder',
    endpoints: [
      { id: 'build_extension', method: 'POST', path: '/api/v1/admin/build-extension', auth: 'jwt',
        roles: ['admin'],
        body: ['lang', 'key_id', 'server_url', 'replace_previous'],
        response: 'application/zip' },
    ],
  },
  {
    id: 'data',
    endpoints: [
      { id: 'data_stats', method: 'GET', path: '/api/v1/data/stats', auth: 'token',
        query: ['days'],
        response: '{\n  "from": "…", "to": "…", "days": 30, "total_events": 42,\n  "by_action": { "blocked": 30, "blocked_hard": 4, "allowed": 8 },\n  "active_devices": 17,\n  "by_severity": { "critical": 12, "high": 20, "medium": 9, "low": 1 },\n  "top_rules": [{ "rule_id": "aws_access_key", "count": 9 }],\n  "top_hosts": [{ "host": "chatgpt.com", "count": 21 }],\n  "trend": [{ "date": "2026-09-27", "total": 3, "blocked": 2, "blocked_hard": 0, "allowed": 1 }]\n}' },
      { id: 'data_events', method: 'GET', path: '/api/v1/data/events', auth: 'token',
        roles: ['itsec', 'infosec', 'admin', 'viewer'],
        query: ['since', 'until', 'action', 'severity', 'limit', 'offset'],
        response: '{\n  "total": 42, "limit": 100, "offset": 0,\n  "items": [{ "id": "uuid", "ts": "…", "device_hash": "a1b2…", "host": "chatgpt.com",\n             "url_hash": "…", "action": "blocked",\n             "findings": [{ "rule_id": "aws_access_key", "severity": "critical" }] }]\n}' },
      { id: 'tokens_list', method: 'GET', path: '/api/v1/tokens', auth: 'jwt',
        response: '[{ "id": "uuid", "name": "Grafana", "is_active": true, "created_at": "…",\n   "last_used": "…", "expires_at": null }]' },
      { id: 'tokens_create', method: 'POST', path: '/api/v1/tokens', auth: 'jwt',
        body: ['name', 'expires_in_days'],
        response: '201 Created\n{ "id": "uuid", "name": "Grafana", "token": "pgr_…", "expires_at": null, … }' },
      { id: 'tokens_revoke', method: 'DELETE', path: '/api/v1/tokens/{id}', auth: 'jwt',
        response: '204 No Content' },
    ],
  },
  {
    id: 'audit',
    endpoints: [
      { id: 'audit_log', method: 'GET', path: '/api/v1/admin/audit-log', auth: 'jwt',
        roles: ['itsec', 'infosec', 'admin', 'dataprivacy'],
        response: '[{ "id": "uuid", "action": "identity_viewed", "actor_id": "...", "actor_name": "jdoe",\n   "approver_name": null, "target_hash": "a1b2...", "ts": "..." }]' },
    ],
  },
] as const satisfies readonly {
  id: string
  endpoints: readonly {
    id: string
    method: Method
    path: string
    auth: Auth
    roles?: readonly string[]
    body?: readonly string[]
    query?: readonly string[]
    response?: string
  }[]
}[]

type AnyEndpoint = typeof API_SECTIONS[number]['endpoints'][number]

export type ApiSectionId = typeof API_SECTIONS[number]['id']
export type EndpointId = AnyEndpoint['id']

type FieldsOf<K extends EndpointId, P extends 'body' | 'query'> =
  Extract<AnyEndpoint, { id: K }> extends infer E
    ? E extends { [Q in P]: readonly (infer F extends string)[] } ? F : never
    : never

type Fields<K extends EndpointId, P extends 'body' | 'query'> =
  [FieldsOf<K, P>] extends [never] ? unknown : { [Q in P]: Record<FieldsOf<K, P>, string> }

/** Texte eines Endpoints: Beschreibung + (falls vorhanden) jede Body-/Query-Feldbeschreibung. */
export type EndpointText<K extends EndpointId> =
  { description: string } & Fields<K, 'body'> & Fields<K, 'query'>
