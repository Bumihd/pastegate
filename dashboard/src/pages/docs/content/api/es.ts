import type { ApiDoc } from './types'

const es: ApiDoc = {
  ui: {
    baseUrl: 'URL base',
    authPublic: 'Público',
    authPublicDesc: 'Sin autenticación',
    authApiKey: 'API key',
    authJwt: 'JWT',
    authToken: 'Token personal',
    roles: 'Roles',
    requestBody: 'Cuerpo de la solicitud',
    queryParams: 'Parámetros de consulta',
    response: 'Respuesta',
    languageNote: 'Todos los endpoints devuelven los mensajes de error en el idioma de la cabecera `Accept-Language` de la solicitud (de, en, fr, es; en inglés si falta la cabecera o el idioma no es compatible).',
  },
  sections: {
    health: 'Estado, metadatos y configuración',
    events: 'Eventos (extensión)',
    setup: 'Asistente de configuración',
    auth: 'Autenticación',
    settings: 'Admin – Configuración',
    stats: 'Admin – Estadísticas',
    admin_events: 'Admin – Eventos',
    devices: 'Admin – Dispositivos',
    domain_rules: 'Admin – Reglas de dominio',
    api_keys: 'Admin – API keys',
    users: 'Admin – Usuarios',
    builder: 'Admin – Generador de extensiones',
    data: 'API de informes (Grafana, Jira, BI …)',
    audit: 'Admin – Registro de auditoría',
  },
  endpoints: {
    ping: { description: 'Comprobación de estado mínima; no requiere autenticación.' },
    healthz: { description: 'Comprobación de liveness/readiness para monitorización (Uptime Kuma, Kubernetes, …). Devuelve 200 si la base de datos está accesible y, si no, 503 con el estado "degraded".' },
    meta: { description: 'Metadatos públicos para el dashboard y la página de inicio de sesión: idioma de la organización y todos los idiomas disponibles.' },
    health_key: { description: 'Prueba de conexión para la extensión: comprueba que el servidor y la API key son válidos.' },
    config: { description: 'Configuración para la extensión, que se consulta cada 60 minutos: reglas de dominio activas e idioma de la organización (`default_lang`). A través de este endpoint, las extensiones desplegadas aplican un cambio de idioma.' },
    events_batch: {
      description: 'Envía hasta 100 eventos de una instancia de la extensión. El ID del dispositivo se hashea en el servidor (HMAC-SHA256). Límite de frecuencia por API key.',
      body: {
        device_id: 'string – UUID de la instancia de la extensión',
        events: 'array – máx. 100 eventos',
        'events[].ts': 'string – marca de tiempo ISO 8601',
        'events[].url_hash': 'string – SHA-256 de la URL completa (64 caracteres hexadecimales)',
        'events[].host': 'string (opcional) – solo el dominio, p. ej. claude.ai',
        'events[].action': '"blocked" | "blocked_hard" | "allowed"',
        'events[].findings': 'array – { rule_id: string, severity: "critical"|"high"|"medium"|"low" }',
      },
    },
    setup_settings: {
      description: 'Asistente de configuración: establece el idioma de la organización. Solo está disponible mientras la configuración inicial no haya finalizado; requiere el token de setup.',
      body: {
        token: 'string – token de setup (SETUP_TOKEN)',
        default_lang: '"de" | "en" | "fr" | "es"',
      },
    },
    login: {
      description: 'Inicio de sesión con nombre de usuario y contraseña. Devuelve un JWT. Si la 2FA está activa, la respuesta incluye totp_required=true; repita entonces la solicitud con totp_code.',
      body: {
        username: 'string',
        password: 'string',
        totp_code: 'string (opcional, 6 dígitos)',
      },
    },
    logout: { description: 'Revoca el JWT actual en el servidor (jti guardado en revoked_tokens).' },
    me: { description: 'Devuelve el perfil del usuario con la sesión iniciada.' },
    change_password: {
      description: 'Cambia la contraseña del usuario con la sesión iniciada.',
      body: {
        current_password: 'string',
        new_password: 'string (mín. 12 caracteres)',
      },
    },
    totp_setup: { description: 'Genera un secreto TOTP. Devuelve el secreto, la URI de aprovisionamiento y un código QR generado en el servidor (data URI SVG).' },
    totp_confirm: {
      description: 'Activa la 2FA tras verificar correctamente el código.',
      body: { totp_code: 'string – código TOTP de 6 dígitos' },
    },
    settings_get: { description: 'Lee la configuración de la organización.' },
    settings_put: {
      description: 'Cambia el idioma de la organización, que pasa a ser el predeterminado del dashboard y de todas las extensiones desplegadas (a través de `/api/v1/config`). El cambio queda registrado en el registro de auditoría.',
      body: { default_lang: '"de" | "en" | "fr" | "es"' },
    },
    stats: { description: 'Estadísticas del dashboard: total de eventos, bloqueados hoy, dispositivos, tendencia de 30 días.' },
    admin_events: {
      description: 'Lista paginada de eventos con sus findings y el dominio (`host`), de más reciente a más antiguo.',
      query: {
        limit: 'integer 1–200 (por defecto 25)',
        offset: 'integer ≥ 0 (por defecto 0)',
        severity: '"critical" | "high" | "medium" | "low" – eventos con al menos un finding de esta gravedad',
        action: '"blocked" | "blocked_hard" | "allowed"',
      },
    },
    devices: { description: 'Lista de todos los dispositivos registrados (anonimizados como hash HMAC).' },
    device_identity: { description: 'Muestra la identidad (p. ej. el correo) de un dispositivo en texto claro. Solo itsec/infosec; cada llamada queda registrada en el registro de auditoría como identity_viewed. identity es null si la extensión aún no la ha transmitido (versión 2.1 o superior).' },
    rules_list: { description: 'Lista todas las reglas de dominio.' },
    rules_create: {
      description: 'Crea una regla de dominio. Comodines: *.example.com. Modos: warn | hard_block | allow.',
      body: {
        pattern: 'string (máx. 253 caracteres, p. ej. *.chatgpt.com)',
        mode: '"warn" | "hard_block" | "allow"',
      },
    },
    rules_delete: { description: 'Desactiva una regla de dominio (borrado lógico).' },
    keys_list: { description: 'Lista todas las API keys. Las claves de despliegue creadas por el generador de extensiones indican su clave base en `parent_id`; las claves base tienen `parent_id: null`.' },
    keys_create: {
      description: 'Crea una nueva API key base. La clave en claro solo aparece en esta respuesta; el servidor guarda un hash HMAC-SHA256.',
      body: { name: 'string (máx. 128 caracteres)' },
    },
    keys_delete: { description: 'Revoca una API key. Al revocar una clave base se revocan también todas sus claves de despliegue.' },
    users_list: { description: 'Lista todos los usuarios.' },
    users_create: {
      description: 'Crea un nuevo usuario.',
      body: {
        username: 'string',
        email: 'string',
        password: 'string (mín. 12 caracteres)',
        role: '"itsec" | "infosec" | "admin" | "management" | "dataprivacy" | "viewer"',
      },
    },
    users_deactivate: { description: 'Desactiva un usuario (ya no podrá iniciar sesión).' },
    build_extension: {
      description: 'Genera un ZIP de la extensión listo para desplegar, con la URL del servidor y la clave integradas. Cada generación crea una nueva clave de despliegue vinculada a la clave base seleccionada; la clave en claro solo existe dentro del ZIP.',
      body: {
        lang: '"de" | "en" | "fr" | "es" (opcional; por defecto, el idioma de la organización)',
        key_id: 'string – UUID de una clave base activa',
        server_url: 'string (opcional) – p. ej. https://pastegate.example.com o http://10.0.0.10; por defecto, SERVER_URL del archivo .env',
        replace_previous: 'boolean (por defecto false) – revocar las claves de despliegue anteriores de esta clave base',
      },
    },
    data_stats: {
      description: 'Cifras agregadas de la organización para paneles externos: disponibles para todos los roles, sin datos personales. Acepta un token personal (pgr_…, creado en **Acceso API**) o un JWT del panel. Límite: 120 solicitudes/minuto por token.',
      query: {
        days: 'integer 1–365 (por defecto 30) – periodo incluido hoy',
      },
    },
    data_events: {
      description: 'Eventos individuales, seudonimizados con el hash del dispositivo: nunca identidades ni etiquetas. Misma visibilidad que en el panel: itsec/infosec/admin ven todos los eventos, los viewers solo sus dispositivos asignados; management/dataprivacy reciben 403 (solo agregados).',
      query: {
        since: 'marca de tiempo ISO-8601 – eventos desde (incluido)',
        until: 'marca de tiempo ISO-8601 – eventos antes de (excluido)',
        action: '"blocked" | "blocked_hard" | "allowed"',
        severity: '"critical" | "high" | "medium" | "low" – eventos con al menos un hallazgo de esta gravedad',
        limit: 'integer 1–1000 (por defecto 100)',
        offset: 'integer ≥ 0 (por defecto 0)',
      },
    },
    tokens_list: { description: 'Lista tus propios tokens personales (nunca el token en sí). Solo con inicio de sesión en el panel: un token no puede gestionar tokens.' },
    tokens_create: {
      description: 'Crea un token personal de solo lectura para /api/v1/data/*. El token solo aparece una vez en la respuesta; solo se guarda su hash. Máx. 10 tokens activos por usuario; la creación queda registrada en el registro de auditoría.',
      body: {
        name: 'string – nombre, p. ej. "Grafana" (1–128 caracteres)',
        expires_in_days: 'integer 1–730 o null – null = no caduca',
      },
    },
    tokens_revoke: { description: 'Revoca uno de tus tokens de inmediato (queda registrado en el registro de auditoría).' },
    audit_log: { description: 'Registro de auditoría conforme al RGPD de todas las consultas de identidad y acciones relevantes para la seguridad, con nombres de usuario (últimas 200 entradas).' },
  },
}

export default es
