import type { ApiDoc } from './types'

const de: ApiDoc = {
  ui: {
    baseUrl: 'Basis-URL',
    authPublic: 'Öffentlich',
    authPublicDesc: 'Keine Authentifizierung',
    authApiKey: 'API-Key',
    authJwt: 'JWT',
    authToken: 'Persönlicher Token',
    roles: 'Rollen',
    requestBody: 'Request-Body',
    queryParams: 'Query-Parameter',
    response: 'Response',
    languageNote: 'Alle Endpoints liefern Fehlermeldungen in der Sprache des Request-Headers `Accept-Language` (de, en, fr, es; Englisch, wenn der Header fehlt oder die Sprache nicht unterstützt wird).',
  },
  sections: {
    health: 'Health, Meta & Config',
    events: 'Events (Extension)',
    setup: 'Setup-Wizard',
    auth: 'Auth',
    settings: 'Admin – Einstellungen',
    stats: 'Admin – Statistiken',
    admin_events: 'Admin – Events',
    devices: 'Admin – Geräte',
    domain_rules: 'Admin – Domain-Regeln',
    api_keys: 'Admin – API-Keys',
    users: 'Admin – Benutzer',
    builder: 'Admin – Extension-Builder',
    data: 'Reporting-API (Grafana, Jira, BI …)',
    audit: 'Admin – Audit-Log',
  },
  endpoints: {
    ping: { description: 'Minimaler Health-Check — keine Authentifizierung nötig.' },
    healthz: { description: 'Liveness-/Readiness-Check für Monitoring (Uptime Kuma, Kubernetes, …). Liefert 200, wenn die Datenbank erreichbar ist, sonst 503 mit Status "degraded".' },
    meta: { description: 'Öffentliche Metadaten für Dashboard und Login-Seite: Organisationssprache und alle unterstützten Sprachen.' },
    health_key: { description: 'Verbindungstest für die Extension: prüft, ob Server und API-Key gültig sind.' },
    config: { description: 'Konfiguration für die Extension, wird alle 60 Minuten abgerufen: aktive Domain-Regeln und die Organisationssprache (`default_lang`). Über diesen Endpoint übernehmen verteilte Extensions eine Sprachänderung.' },
    events_batch: {
      description: 'Sendet bis zu 100 Events einer Extension-Instanz. Die Device-ID wird serverseitig gehasht (HMAC-SHA256). Rate-Limit pro API-Key.',
      body: {
        device_id: 'string – UUID der Extension-Instanz',
        events: 'array – max. 100 Events',
        'events[].ts': 'string – ISO-8601-Zeitstempel',
        'events[].url_hash': 'string – SHA-256 der vollständigen URL (64 Hex-Zeichen)',
        'events[].host': 'string (optional) – nur die Domain, z. B. claude.ai',
        'events[].action': '"blocked" | "blocked_hard" | "allowed"',
        'events[].findings': 'array – { rule_id: string, severity: "critical"|"high"|"medium"|"low" }',
      },
    },
    setup_settings: {
      description: 'Setup-Wizard: setzt die Organisationssprache. Nur verfügbar, solange das Setup nicht abgeschlossen ist; erfordert den Setup-Token.',
      body: {
        token: 'string – Setup-Token (SETUP_TOKEN)',
        default_lang: '"de" | "en" | "fr" | "es"',
      },
    },
    login: {
      description: 'Login mit Benutzername und Passwort. Gibt ein JWT zurück. Ist 2FA aktiv, enthält die Antwort totp_required=true; dann den Request mit totp_code wiederholen.',
      body: {
        username: 'string',
        password: 'string',
        totp_code: 'string (optional, 6 Ziffern)',
      },
    },
    logout: { description: 'Widerruft das aktuelle JWT serverseitig (jti in revoked_tokens).' },
    me: { description: 'Gibt das Profil des aktuell angemeldeten Users zurück.' },
    change_password: {
      description: 'Ändert das Passwort des angemeldeten Users.',
      body: {
        current_password: 'string',
        new_password: 'string (min. 12 Zeichen)',
      },
    },
    totp_setup: { description: 'Erzeugt ein TOTP-Secret. Gibt Secret, Provisioning-URI und einen serverseitig gerenderten QR-Code (SVG-Data-URI) zurück.' },
    totp_confirm: {
      description: 'Aktiviert 2FA nach erfolgreicher Code-Prüfung.',
      body: { totp_code: 'string – 6-stelliger TOTP-Code' },
    },
    settings_get: { description: 'Liest die Organisationseinstellungen.' },
    settings_put: {
      description: 'Ändert die Organisationssprache. Sie wird zum Standard für das Dashboard und für alle verteilten Extensions (über `/api/v1/config`). Die Änderung wird im Audit-Log protokolliert.',
      body: { default_lang: '"de" | "en" | "fr" | "es"' },
    },
    stats: { description: 'Dashboard-Statistiken: Events gesamt, heute blockiert, Geräte, 30-Tage-Trend.' },
    admin_events: {
      description: 'Paginierte Event-Liste mit Findings und Domain (`host`), neueste zuerst.',
      query: {
        limit: 'integer 1–200 (Standard 25)',
        offset: 'integer ≥ 0 (Standard 0)',
        severity: '"critical" | "high" | "medium" | "low" – Events mit mindestens einem Finding dieses Schweregrads',
        action: '"blocked" | "blocked_hard" | "allowed"',
      },
    },
    devices: { description: 'Liste aller registrierten Geräte (anonymisiert als HMAC-Hash).' },
    device_identity: { description: 'Zeigt die Identität (z. B. E-Mail) eines Geräts im Klartext. Nur itsec/infosec; jeder Aufruf wird als identity_viewed im Audit-Log protokolliert. identity ist null, solange die Extension noch keine übermittelt hat (ab Version 2.1).' },
    rules_list: { description: 'Listet alle Domain-Regeln auf.' },
    rules_create: {
      description: 'Legt eine Domain-Regel an. Wildcards: *.example.com. Modi: warn | hard_block | allow.',
      body: {
        pattern: 'string (max. 253 Zeichen, z. B. *.chatgpt.com)',
        mode: '"warn" | "hard_block" | "allow"',
      },
    },
    rules_delete: { description: 'Deaktiviert eine Domain-Regel (Soft Delete).' },
    keys_list: { description: 'Listet alle API-Keys auf. Vom Extension-Builder erzeugte Deploy-Keys tragen in `parent_id` ihren Basis-Key; Basis-Keys haben `parent_id: null`.' },
    keys_create: {
      description: 'Legt einen neuen Basis-API-Key an. Der Klartext-Key steht nur in dieser Response — der Server speichert einen HMAC-SHA256-Hash.',
      body: { name: 'string (max. 128 Zeichen)' },
    },
    keys_delete: { description: 'Widerruft einen API-Key. Beim Widerruf eines Basis-Keys werden alle zugehörigen Deploy-Keys mit widerrufen.' },
    users_list: { description: 'Listet alle Benutzer auf.' },
    users_create: {
      description: 'Legt einen neuen Benutzer an.',
      body: {
        username: 'string',
        email: 'string',
        password: 'string (min. 12 Zeichen)',
        role: '"itsec" | "infosec" | "admin" | "management" | "dataprivacy" | "viewer"',
      },
    },
    users_deactivate: { description: 'Deaktiviert einen Benutzer (kein Login mehr möglich).' },
    build_extension: {
      description: 'Erzeugt ein fertig konfiguriertes Extension-ZIP mit eingebetteter Server-URL und eingebettetem Key. Jeder Build legt einen neuen Deploy-Key an, der mit dem gewählten Basis-Key verknüpft ist; der Klartext-Key existiert nur im ZIP.',
      body: {
        lang: '"de" | "en" | "fr" | "es" (optional, Standard: Organisationssprache)',
        key_id: 'string – UUID eines aktiven Basis-Keys',
        server_url: 'string (optional) – z. B. https://pastegate.example.com oder http://10.0.0.10; Standard: SERVER_URL aus .env',
        replace_previous: 'boolean (Standard false) – frühere Deploy-Keys dieses Basis-Keys widerrufen',
      },
    },
    data_stats: {
      description: 'Aggregierte Kennzahlen der Organisation für externe Dashboards – für jede Rolle, ohne Personenbezug. Akzeptiert einen persönlichen Token (pgr_…, anzulegen unter **API-Zugang**) oder ein Dashboard-JWT. Rate-Limit: 120 Anfragen/Minute pro Token.',
      query: {
        days: 'integer 1–365 (Standard 30) – Zeitraum inkl. heute',
      },
    },
    data_events: {
      description: 'Einzelne Events, pseudonymisiert per Device-Hash – nie Klarnamen oder Labels. Sichtbarkeit wie im Dashboard: itsec/infosec/admin sehen alle Events, Viewer nur ihre zugewiesenen Geräte; management/dataprivacy erhalten 403 (nur Aggregate).',
      query: {
        since: 'ISO-8601-Zeitstempel – Events ab (inklusive)',
        until: 'ISO-8601-Zeitstempel – Events vor (exklusive)',
        action: '"blocked" | "blocked_hard" | "allowed"',
        severity: '"critical" | "high" | "medium" | "low" – Events mit mindestens einem Finding dieses Schweregrads',
        limit: 'integer 1–1000 (Standard 100)',
        offset: 'integer ≥ 0 (Standard 0)',
      },
    },
    tokens_list: { description: 'Listet die eigenen persönlichen Tokens (nie den Token selbst). Nur mit Dashboard-Login – ein Token kann keine Tokens verwalten.' },
    tokens_create: {
      description: 'Erzeugt einen persönlichen, rein lesenden Token für /api/v1/data/*. Der Token steht nur einmal in der Antwort; gespeichert wird nur sein Hash. Max. 10 aktive Tokens pro User; das Anlegen wird im Audit-Log protokolliert.',
      body: {
        name: 'string – Bezeichnung, z. B. "Grafana" (1–128 Zeichen)',
        expires_in_days: 'integer 1–730 oder null – null = läuft nicht ab',
      },
    },
    tokens_revoke: { description: 'Widerruft einen eigenen Token sofort (wird im Audit-Log protokolliert).' },
    audit_log: { description: 'DSGVO-konformes Audit-Log aller Klarnamen-Abrufe und sicherheitsrelevanten Aktionen, mit Benutzernamen (die letzten 200 Einträge).' },
  },
}

export default de
