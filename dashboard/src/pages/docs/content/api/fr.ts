import type { ApiDoc } from './types'

const fr: ApiDoc = {
  ui: {
    baseUrl: 'URL de base',
    authPublic: 'Public',
    authPublicDesc: 'Sans authentification',
    authApiKey: 'API key',
    authJwt: 'JWT',
    authToken: 'Jeton personnel',
    roles: 'Rôles',
    requestBody: 'Corps de la requête',
    queryParams: 'Paramètres de requête',
    response: 'Réponse',
    languageNote: 'Tous les endpoints renvoient leurs messages d\'erreur dans la langue de l\'en-tête `Accept-Language` de la requête (de, en, fr, es ; anglais si l\'en-tête est absent ou la langue non prise en charge).',
  },
  sections: {
    health: 'Santé, métadonnées et configuration',
    events: 'Événements (extension)',
    setup: 'Assistant de configuration',
    auth: 'Authentification',
    settings: 'Admin – Paramètres',
    stats: 'Admin – Statistiques',
    admin_events: 'Admin – Événements',
    devices: 'Admin – Appareils',
    domain_rules: 'Admin – Règles de domaine',
    api_keys: 'Admin – API keys',
    users: 'Admin – Utilisateurs',
    builder: 'Admin – Générateur d\'extension',
    data: 'API de reporting (Grafana, Jira, BI …)',
    audit: 'Admin – Journal d\'audit',
  },
  endpoints: {
    ping: { description: 'Contrôle de santé minimal — aucune authentification requise.' },
    healthz: { description: 'Contrôle liveness/readiness pour la supervision (Uptime Kuma, Kubernetes, …). Renvoie 200 si la base de données est joignable, sinon 503 avec le statut "degraded".' },
    meta: { description: 'Métadonnées publiques pour le dashboard et la page de connexion : langue de l\'organisation et liste des langues prises en charge.' },
    health_key: { description: 'Test de connexion pour l\'extension : vérifie que le serveur et l\'API key sont valides.' },
    config: { description: 'Configuration de l\'extension, récupérée toutes les 60 minutes : règles de domaine actives et langue de l\'organisation (`default_lang`). C\'est par cet endpoint que les extensions déployées prennent en compte un changement de langue.' },
    events_batch: {
      description: 'Envoie jusqu\'à 100 événements d\'une instance de l\'extension. L\'ID de l\'appareil est hashé côté serveur (HMAC-SHA256). Limitation de débit par API key.',
      body: {
        device_id: 'string – UUID de l\'instance de l\'extension',
        events: 'array – 100 événements max.',
        'events[].ts': 'string – horodatage ISO 8601',
        'events[].url_hash': 'string – SHA-256 de l\'URL complète (64 caractères hexadécimaux)',
        'events[].host': 'string (facultatif) – domaine uniquement, p. ex. claude.ai',
        'events[].action': '"blocked" | "blocked_hard" | "allowed"',
        'events[].findings': 'array – { rule_id: string, severity: "critical"|"high"|"medium"|"low" }',
      },
    },
    setup_settings: {
      description: 'Assistant de configuration : définit la langue de l\'organisation. Disponible uniquement tant que la configuration initiale n\'est pas terminée ; nécessite le token de setup.',
      body: {
        token: 'string – token de setup (SETUP_TOKEN)',
        default_lang: '"de" | "en" | "fr" | "es"',
      },
    },
    login: {
      description: 'Connexion par nom d\'utilisateur et mot de passe. Renvoie un JWT. Si la 2FA est active, la réponse contient totp_required=true ; renvoyez alors la requête avec totp_code.',
      body: {
        username: 'string',
        password: 'string',
        totp_code: 'string (facultatif, 6 chiffres)',
      },
    },
    logout: { description: 'Révoque le JWT courant côté serveur (jti enregistré dans revoked_tokens).' },
    me: { description: 'Renvoie le profil de l\'utilisateur actuellement connecté.' },
    change_password: {
      description: 'Modifie le mot de passe de l\'utilisateur connecté.',
      body: {
        current_password: 'string',
        new_password: 'string (12 caractères min.)',
      },
    },
    totp_setup: { description: 'Génère un secret TOTP. Renvoie le secret, l\'URI de provisionnement et un QR code généré côté serveur (data URI SVG).' },
    totp_confirm: {
      description: 'Active la 2FA après vérification réussie du code.',
      body: { totp_code: 'string – code TOTP à 6 chiffres' },
    },
    settings_get: { description: 'Lit les paramètres de l\'organisation.' },
    settings_put: {
      description: 'Modifie la langue de l\'organisation. Elle devient la langue par défaut du dashboard et de toutes les extensions déployées (via `/api/v1/config`). La modification est consignée dans le journal d\'audit.',
      body: { default_lang: '"de" | "en" | "fr" | "es"' },
    },
    stats: { description: 'Statistiques du dashboard : total des événements, blocages du jour, appareils, tendance sur 30 jours.' },
    admin_events: {
      description: 'Liste paginée des événements avec leurs findings et le domaine (`host`), du plus récent au plus ancien.',
      query: {
        limit: 'integer 1–200 (par défaut 25)',
        offset: 'integer ≥ 0 (par défaut 0)',
        severity: '"critical" | "high" | "medium" | "low" – événements ayant au moins un finding de cette gravité',
        action: '"blocked" | "blocked_hard" | "allowed"',
      },
    },
    devices: { description: 'Liste de tous les appareils enregistrés (anonymisés sous forme de hash HMAC).' },
    device_identity: { description: 'Affiche l\'identité (p. ex. l\'e-mail) d\'un appareil en clair. Réservé à itsec/infosec ; chaque appel est consigné dans le journal d\'audit comme identity_viewed. identity vaut null tant que l\'extension n\'en a pas transmis (version 2.1 ou ultérieure).' },
    rules_list: { description: 'Liste toutes les règles de domaine.' },
    rules_create: {
      description: 'Crée une règle de domaine. Jokers : *.example.com. Modes : warn | hard_block | allow.',
      body: {
        pattern: 'string (253 caractères max., p. ex. *.chatgpt.com)',
        mode: '"warn" | "hard_block" | "allow"',
      },
    },
    rules_delete: { description: 'Désactive une règle de domaine (suppression logique).' },
    keys_list: { description: 'Liste toutes les API keys. Les clés de déploiement créées par le générateur d\'extension indiquent leur clé de base dans `parent_id` ; les clés de base ont `parent_id: null`.' },
    keys_create: {
      description: 'Crée une nouvelle API key de base. La clé en clair n\'apparaît que dans cette réponse — le serveur n\'en stocke qu\'un hash HMAC-SHA256.',
      body: { name: 'string (128 caractères max.)' },
    },
    keys_delete: { description: 'Révoque une API key. La révocation d\'une clé de base révoque aussi toutes ses clés de déploiement.' },
    users_list: { description: 'Liste tous les utilisateurs.' },
    users_create: {
      description: 'Crée un nouvel utilisateur.',
      body: {
        username: 'string',
        email: 'string',
        password: 'string (12 caractères min.)',
        role: '"itsec" | "infosec" | "admin" | "management" | "dataprivacy" | "viewer"',
      },
    },
    users_deactivate: { description: 'Désactive un utilisateur (plus aucune connexion possible).' },
    build_extension: {
      description: 'Génère un ZIP de l\'extension prêt à déployer, avec URL du serveur et clé intégrées. Chaque génération crée une nouvelle clé de déploiement rattachée à la clé de base sélectionnée ; la clé en clair n\'existe que dans le ZIP.',
      body: {
        lang: '"de" | "en" | "fr" | "es" (facultatif, par défaut : langue de l\'organisation)',
        key_id: 'string – UUID d\'une clé de base active',
        server_url: 'string (facultatif) – p. ex. https://pastegate.example.com ou http://10.0.0.10 ; par défaut : SERVER_URL du fichier .env',
        replace_previous: 'boolean (par défaut false) – révoquer les anciennes clés de déploiement de cette clé de base',
      },
    },
    data_stats: {
      description: 'Chiffres agrégés de l\'organisation pour des tableaux de bord externes – accessibles à tous les rôles, sans données personnelles. Accepte un jeton personnel (pgr_…, à créer sous **Accès API**) ou un JWT du tableau de bord. Limite : 120 requêtes/minute par jeton.',
      query: {
        days: 'integer 1–365 (30 par défaut) – période, aujourd\'hui inclus',
      },
    },
    data_events: {
      description: 'Événements individuels, pseudonymisés par hash d\'appareil – jamais d\'identités ni de libellés. Même visibilité que dans le tableau de bord : itsec/infosec/admin voient tous les événements, les viewers uniquement leurs appareils assignés ; management/dataprivacy reçoivent 403 (agrégats uniquement).',
      query: {
        since: 'horodatage ISO-8601 – événements à partir de (inclus)',
        until: 'horodatage ISO-8601 – événements avant (exclu)',
        action: '"blocked" | "blocked_hard" | "allowed"',
        severity: '"critical" | "high" | "medium" | "low" – événements avec au moins une détection de cette gravité',
        limit: 'integer 1–1000 (100 par défaut)',
        offset: 'integer ≥ 0 (0 par défaut)',
      },
    },
    tokens_list: { description: 'Liste vos propres jetons personnels (jamais le jeton lui-même). Uniquement avec une connexion au tableau de bord – un jeton ne peut pas gérer de jetons.' },
    tokens_create: {
      description: 'Crée un jeton personnel en lecture seule pour /api/v1/data/*. Le jeton n\'apparaît qu\'une fois dans la réponse ; seul son hash est stocké. 10 jetons actifs max. par utilisateur ; la création est consignée dans le journal d\'audit.',
      body: {
        name: 'string – libellé, p. ex. "Grafana" (1–128 caractères)',
        expires_in_days: 'integer 1–730 ou null – null = n\'expire pas',
      },
    },
    tokens_revoke: { description: 'Révoque immédiatement l\'un de vos jetons (consigné dans le journal d\'audit).' },
    audit_log: { description: 'Journal d\'audit conforme au RGPD de toutes les consultations d\'identité et actions pertinentes pour la sécurité, avec noms d\'utilisateur (200 dernières entrées).' },
  },
}

export default fr
