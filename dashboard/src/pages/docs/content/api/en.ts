import type { ApiDoc } from './types'

const en: ApiDoc = {
  ui: {
    baseUrl: 'Base URL',
    authPublic: 'Public',
    authPublicDesc: 'No auth',
    authApiKey: 'API key',
    authJwt: 'JWT',
    authToken: 'Personal token',
    roles: 'Roles',
    requestBody: 'Request body',
    queryParams: 'Query parameters',
    response: 'Response',
    languageNote: 'All endpoints return error messages in the language of the `Accept-Language` request header (de, en, fr, es; English if the header is missing or unsupported).',
  },
  sections: {
    health: 'Health, meta & config',
    events: 'Events (extension)',
    setup: 'Setup wizard',
    auth: 'Auth',
    settings: 'Admin – Settings',
    stats: 'Admin – Statistics',
    admin_events: 'Admin – Events',
    devices: 'Admin – Devices',
    domain_rules: 'Admin – Domain rules',
    api_keys: 'Admin – API keys',
    users: 'Admin – Users',
    builder: 'Admin – Extension builder',
    data: 'Reporting API (Grafana, Jira, BI …)',
    audit: 'Admin – Audit log',
  },
  endpoints: {
    ping: { description: 'Minimal health check — no auth required.' },
    healthz: { description: 'Liveness/readiness check for monitoring (Uptime Kuma, Kubernetes, …). Returns 200 when the database is reachable, otherwise 503 with status "degraded".' },
    meta: { description: 'Public metadata for the dashboard and login page: the organisation language and all supported languages.' },
    health_key: { description: 'Connection test for the extension: checks that server and API key are valid.' },
    config: { description: 'Configuration for the extension, fetched every 60 minutes: active domain rules and the organisation language (`default_lang`). Deployed extensions pick up a language change through this endpoint.' },
    events_batch: {
      description: 'Sends up to 100 events from one extension instance. The device ID is hashed on the server (HMAC-SHA256). Rate-limited per API key.',
      body: {
        device_id: 'string – UUID of the extension instance',
        events: 'array – max. 100 events',
        'events[].ts': 'string – ISO 8601 timestamp',
        'events[].url_hash': 'string – SHA-256 of the full URL (64 hex chars)',
        'events[].host': 'string (optional) – domain only, e.g. claude.ai',
        'events[].action': '"blocked" | "blocked_hard" | "allowed"',
        'events[].findings': 'array – { rule_id: string, severity: "critical"|"high"|"medium"|"low" }',
      },
    },
    setup_settings: {
      description: 'Setup wizard: sets the organisation language. Only available while setup is not complete; requires the setup token.',
      body: {
        token: 'string – setup token (SETUP_TOKEN)',
        default_lang: '"de" | "en" | "fr" | "es"',
      },
    },
    login: {
      description: 'Login with username and password. Returns a JWT. If 2FA is active, the response contains totp_required=true; repeat the request with totp_code.',
      body: {
        username: 'string',
        password: 'string',
        totp_code: 'string (optional, 6 digits)',
      },
    },
    logout: { description: 'Revokes the current JWT on the server (jti stored in revoked_tokens).' },
    me: { description: 'Returns the profile of the currently logged-in user.' },
    change_password: {
      description: 'Changes the password of the logged-in user.',
      body: {
        current_password: 'string',
        new_password: 'string (min. 12 chars)',
      },
    },
    totp_setup: { description: 'Generates a TOTP secret. Returns the secret, the provisioning URI and a QR code rendered on the server (SVG data URI).' },
    totp_confirm: {
      description: 'Activates 2FA after a successful code check.',
      body: { totp_code: 'string – 6-digit TOTP code' },
    },
    settings_get: { description: 'Reads the organisation settings.' },
    settings_put: {
      description: 'Changes the organisation language. It becomes the default for the dashboard and for all deployed extensions (via `/api/v1/config`). The change is recorded in the audit log.',
      body: { default_lang: '"de" | "en" | "fr" | "es"' },
    },
    stats: { description: 'Dashboard statistics: total events, blocked today, devices, 30-day trend.' },
    admin_events: {
      description: 'Paginated event list with findings and domain (`host`), newest first.',
      query: {
        limit: 'integer 1–200 (default 25)',
        offset: 'integer ≥ 0 (default 0)',
        severity: '"critical" | "high" | "medium" | "low" – events with at least one finding of this severity',
        action: '"blocked" | "blocked_hard" | "allowed"',
      },
    },
    devices: { description: 'List of all registered devices (anonymised as HMAC hash).' },
    device_identity: { description: 'Show the identity (e.g. e-mail) of a device in clear text. Only itsec/infosec; every call is recorded in the audit log as identity_viewed. identity is null if the extension has not transmitted one yet (version 2.1 or newer).' },
    rules_list: { description: 'Lists all domain rules.' },
    rules_create: {
      description: 'Creates a domain rule. Wildcards: *.example.com. Modes: warn | hard_block | allow.',
      body: {
        pattern: 'string (max. 253 chars, e.g. *.chatgpt.com)',
        mode: '"warn" | "hard_block" | "allow"',
      },
    },
    rules_delete: { description: 'Deactivates a domain rule (soft delete).' },
    keys_list: { description: 'Lists all API keys. Deploy keys created by the extension builder have `parent_id` set to their base key; base keys have `parent_id: null`.' },
    keys_create: {
      description: 'Creates a new base API key. The raw key is only returned in this response — the server stores an HMAC-SHA256 hash.',
      body: { name: 'string (max. 128 chars)' },
    },
    keys_delete: { description: 'Revokes an API key. Revoking a base key also revokes all of its deploy keys.' },
    users_list: { description: 'Lists all users.' },
    users_create: {
      description: 'Creates a new user.',
      body: {
        username: 'string',
        email: 'string',
        password: 'string (min. 12 chars)',
        role: '"itsec" | "infosec" | "admin" | "management" | "dataprivacy" | "viewer"',
      },
    },
    users_deactivate: { description: 'Deactivates a user (no further login possible).' },
    build_extension: {
      description: 'Generates a ready-to-deploy extension ZIP with embedded server URL and key. Every build creates a new deploy key linked to the selected base key; the raw key exists only inside the ZIP.',
      body: {
        lang: '"de" | "en" | "fr" | "es" (optional, default: organisation language)',
        key_id: 'string – UUID of an active base key',
        server_url: 'string (optional) – e.g. https://pastegate.example.com or http://10.0.0.10; default: SERVER_URL from .env',
        replace_previous: 'boolean (default false) – revoke earlier deploy keys of this base key',
      },
    },
    data_stats: {
      description: 'Aggregated figures of the organisation for external dashboards – available to every role, no personal data. Accepts a personal token (pgr_…, created under **API access**) or a dashboard JWT. Rate limit: 120 requests/minute per token.',
      query: {
        days: 'integer 1–365 (default 30) – time window incl. today',
      },
    },
    data_events: {
      description: 'Individual events, pseudonymised by device hash – never identities or labels. Same visibility as in the dashboard: itsec/infosec/admin see all events, viewers only their assigned devices; management/dataprivacy get 403 (aggregates only).',
      query: {
        since: 'ISO-8601 timestamp – events from (inclusive)',
        until: 'ISO-8601 timestamp – events before (exclusive)',
        action: '"blocked" | "blocked_hard" | "allowed"',
        severity: '"critical" | "high" | "medium" | "low" – events with at least one finding of this severity',
        limit: 'integer 1–1000 (default 100)',
        offset: 'integer ≥ 0 (default 0)',
      },
    },
    tokens_list: { description: 'Lists your own personal tokens (never the token itself). Dashboard login only – a token cannot manage tokens.' },
    tokens_create: {
      description: 'Creates a personal read-only token for /api/v1/data/*. The token is only shown once in the response; only its hash is stored. Max. 10 active tokens per user; creation is recorded in the audit log.',
      body: {
        name: 'string – label, e.g. "Grafana" (1–128 characters)',
        expires_in_days: 'integer 1–730 or null – null = does not expire',
      },
    },
    tokens_revoke: { description: 'Revokes one of your tokens immediately (recorded in the audit log).' },
    audit_log: { description: 'GDPR-compliant audit log of all identity lookups and security-relevant actions, with usernames (latest 200 entries).' },
  },
}

export default en
