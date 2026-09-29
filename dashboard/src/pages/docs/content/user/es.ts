import type { UserDoc } from './types'

const es: UserDoc = {
  sections: {
    getting_started: {
      title: 'Primeros pasos',
      items: {
        what: {
          heading: '¿Qué es Pastegate?',
          text: 'Pastegate es una extensión de navegador que evita que datos sensibles (contraseñas, API keys, números de tarjeta de crédito, documentos personales) se peguen por error en sitios web externos. Funciona en segundo plano, analiza automáticamente el portapapeles en cada pegado y avisa al usuario antes de que se inserte nada.',
        },
        detection: {
          heading: '¿Cómo funciona la detección?',
          text: 'Pastegate utiliza más de 80 patrones basados en reglas (expresiones regulares) que se ejecutan localmente en el navegador. Ningún texto en claro sale del equipo. Al servidor solo se envían metadatos anonimizados: regla y nivel de gravedad, la acción realizada, el dominio (p. ej. claude.ai) y un hash SHA-256 de la URL completa.',
        },
        severity: {
          heading: 'Niveles de gravedad',
          text: 'Crítico: claves de AWS/GCP/Azure, claves privadas, contraseñas en claro\nAlto: tokens de GitHub/GitLab, JWT, API keys genéricas\nMedio: direcciones de correo, IBAN, números de tarjeta de crédito\nBajo: contenido posiblemente sensible (detección heurística)',
        },
        language: {
          heading: 'Idioma de la extensión',
          text: 'La extensión usa el idioma de la organización definido por sus administradores. Los usuarios pueden cambiar en cualquier momento entre el idioma de la organización y el inglés desde la ventana emergente de la extensión.',
        },
      },
    },
    admin: {
      title: 'Manual de administración',
      items: {
        install: {
          heading: 'Instalación',
          text: 'Pastegate se instala con un único script, que configura automáticamente PostgreSQL, el backend FastAPI, el dashboard React y nginx.',
          code: 'sudo bash install.sh',
        },
        org_language: {
          heading: 'Idioma de la organización',
          text: 'El idioma de la organización se elige en el asistente de configuración y puede cambiarse después en **Configuración → Idioma de la organización**. Es el idioma predeterminado del dashboard y de todas las extensiones desplegadas.\n\nLas extensiones desplegadas aplican el cambio automáticamente la próxima vez que obtienen su configuración (`GET /api/v1/config`, campo `default_lang`); no hace falta volver a generar ni a desplegar el paquete. Los usuarios siguen pudiendo alternar entre el idioma de la organización y el inglés en la ventana emergente de la extensión.',
        },
        build: {
          heading: 'Generar el paquete de la extensión',
          text: 'En **Generar extensión**, seleccione una API key base, el idioma (por defecto, el de la organización) y la URL del servidor. El ZIP generado contiene la extensión con la URL del servidor y una clave ya integradas: los usuarios no tienen que configurar nada.\n\nCada generación crea una nueva clave de despliegue vinculada a la clave base seleccionada. En un nuevo despliegue puede revocar a la vez las claves de despliegue anteriores de esa clave base; las extensiones que sigan usando esas claves dejarán de enviar eventos.',
        },
        mdm: {
          heading: 'Despliegue por MDM (Intune, Jamf, GPO)',
          text: '1. Forzar la instalación de la extensión mediante Chrome policy (ExtensionInstallForcelist o ExtensionSettings)\n2. Opcional: proporcionar `server_url`, `api_key` y `lang` (de, en, fr, es) como configuración administrada de la extensión\n3. Asignar la policy a los grupos de dispositivos de destino\n\nDetalles: consulte la guía MDM en el dashboard.',
        },
        api_keys: {
          heading: 'Gestionar API keys',
          text: 'Recomendación: una clave base por departamento o sede. Las claves de despliegue creadas por el generador de extensiones se agrupan bajo su clave base. Si una clave se ve comprometida, revoque la clave base: todas sus claves de despliegue se revocan con ella, sin afectar a otros grupos.\n\nLas claves se almacenan solo como hash HMAC-SHA256; la clave en claro solo se muestra una vez, al crearla.',
        },
        users: {
          heading: 'Crear usuarios',
          text: 'Cree cuentas nuevas en **Usuarios → Crear usuario**. Elija el rol con cuidado: itsec e infosec tienen acceso a todos los detalles de los eventos. Recomendación: activar la 2FA en todos los roles con privilegios.',
        },
      },
    },
    itsec: {
      title: 'Manual de seguridad TI',
      items: {
        events: {
          heading: 'Análisis de eventos',
          text: 'En **Eventos** se listan todos los pegados en orden cronológico. Puede filtrar por acción (blocked, blocked_hard, allowed) y por gravedad; la columna «App / Host» muestra el dominio de destino. Preste especial atención a `action=allowed`: el usuario ignoró el aviso de forma deliberada.',
        },
        domain_rules: {
          heading: 'Reglas de dominio',
          text: 'En **Reglas de dominio**, cada dominio puede configurarse en uno de estos tres modos:\n\n• warn: se muestra un aviso, pero el usuario puede pegar igualmente (predeterminado)\n• hard_block: se muestra un aviso y no es posible omitirlo (p. ej. ChatGPT, Pastebin)\n• allow: sin análisis ni aviso (herramientas internas como Jira o Confluence)\n\nComodines: `*.chatgpt.com` abarca todos los subdominios.',
        },
        identity: {
          heading: 'Mostrar identidades',
          text: 'Los eventos y dispositivos aparecen para todos los roles solo como hash de dispositivo. Los usuarios itsec e infosec pueden usar «Mostrar identidad» en **Dispositivos** o **Eventos** para ver a quién pertenece un dispositivo (correo del perfil o identidad definida por MDM, extensión 2.1 o superior).\n\nNo hace falta ninguna solicitud, pero cada consulta queda registrada en el registro de auditoría con usuario, dispositivo, hora e IP y es visible para protección de datos.',
        },
        incident: {
          heading: 'Respuesta a incidentes',
          text: 'Ante la sospecha de una fuga de datos:\n1. Filtrar eventos por action=allowed\n2. Priorizar la gravedad «crítica»\n3. Identificar el dispositivo afectado con «Mostrar identidad»\n4. Exportar el registro de auditoría como documentación (CSV en Informes RGPD)',
        },
      },
    },
    management: {
      title: 'Manual de dirección',
      items: {
        risk: {
          heading: 'Entender el mapa de riesgos',
          text: 'La puntuación de riesgo (0–100) agrega todos los eventos según su gravedad. Los eventos críticos pesan 4 veces y los altos, 2 veces. Una puntuación superior a 70 requiere la atención del equipo de seguridad TI.',
        },
        trend: {
          heading: 'Interpretar la tendencia mensual',
          text: 'Un aumento de eventos puede significar dos cosas:\n• más intentos de pegar datos sensibles (negativo)\n• mayor concienciación tras las formaciones (positivo, porque se avisa a los usuarios)\n\nJunto con la tasa de action=allowed, la tendencia resulta mucho más significativa.',
        },
      },
    },
    dataprivacy: {
      title: 'Manual de protección de datos',
      items: {
        gdpr: {
          heading: 'Cumplimiento del RGPD',
          text: 'Pastegate nunca almacena contenido pegado. Los hashes de dispositivo son valores HMAC-SHA256 con sal en el servidor y no pueden revertirse sin ella. La identidad del dispositivo (correo) se guarda solo cifrada con AES-GCM y únicamente itsec/infosec pueden leerla. Las URL se guardan como hash SHA-256; solo el dominio queda en texto claro para el triaje. Sin fragmentos.',
        },
        audit: {
          heading: 'Registro de auditoría',
          text: 'El registro de auditoría registra con nombre de usuario todas las acciones relevantes para la seguridad, en particular:\n• cada consulta de identidad (quién vio la identidad de qué dispositivo y cuándo)\n• inicios de sesión\n\nEl registro es inmutable y puede exportarse como CSV.',
        },
        access: {
          heading: 'Derecho de acceso (art. 15 RGPD)',
          text: 'Previa solicitud, todos los eventos de un dispositivo pueden identificarse mediante su hash. Solo itsec/infosec pueden ver a qué persona pertenece un hash; cada consulta queda registrada en el registro de auditoría.',
        },
        erasure: {
          heading: 'Derecho de supresión (art. 17 RGPD)',
          text: 'Pastegate es un sistema de auditoría de seguridad. Los eventos se eliminan automáticamente al finalizar el periodo de conservación configurado (por defecto: 90 días). Los dispositivos cuya extensión no se ha comunicado en 30 días se eliminan por completo, con todos sus eventos y la identidad cifrada (`DEVICE_RETENTION_DAYS`, 0 = desactivado). La comprobación se ejecuta al iniciar y cada 6 horas. La eliminación manual inmediata de eventos individuales no está prevista de forma intencionada, ya que comprometería la integridad de la pista de auditoría.',
        },
      },
    },
  },
}

export default es
