import type { MdmDoc } from './types'

const es: MdmDoc = {
  intro: 'Cómo desplegar la extensión Pastegate de forma centralizada con un sistema MDM. Los usuarios no tienen que configurar nada: todo se gestiona de forma centralizada.',
  step1: {
    title: 'Paso 1 – Generar el paquete de la extensión',
    lead: 'En el dashboard, en **Generar extensión**:',
    steps: [
      'Seleccionar una API key base (recomendado: una por departamento o grupo de despliegue)',
      'Elegir el idioma; por defecto se usa el de la organización',
      'Comprobar la URL del servidor: los dispositivos deben poder acceder a ella por HTTPS con un certificado válido',
      'Hacer clic en «Descargar paquete de la extensión»',
    ],
    zipNote: 'El ZIP contiene la extensión con un `config.js` integrado. Cada generación crea una nueva clave de despliegue vinculada a la clave base seleccionada:',
  },
  intune: {
    optionA: 'Opción A – Instalación forzada mediante el catálogo de configuración (recomendado)',
    optionALead: 'Intune instala la extensión mediante Chrome policy; los usuarios no pueden eliminarla.',
    optionASteps: [
      'Intune → Dispositivos → Configuración → Crear → Nueva directiva',
      'Plataforma: Windows 10 y posteriores · Tipo de perfil: Catálogo de configuración',
      'Agregar configuración: Google Chrome → Extensions → `Configure extension management settings`',
      'Introducir el siguiente JSON (sustituir `EXTENSION_ID`):',
    ],
    webStoreNote: 'La URL de actualización anterior corresponde a Chrome Web Store. Para un paquete alojado internamente, use en su lugar la URL de su propio manifiesto de actualización (ver opción B).',
    configTitle: 'Configuración administrada (opcional)',
    configLead: 'Chrome lee la configuración administrada de las extensiones desde la clave de policy `3rdparty`. Distribuya estos valores del registro, por ejemplo con un script de PowerShell de Intune (Dispositivos → Scripts y correcciones):',
    precedenceNote: 'Los valores integrados por el generador de extensiones (`config.js`) tienen prioridad. La configuración administrada solo completa los campos que el paquete no contiene, por lo que se necesita sobre todo para un paquete genérico sin clave integrada.',
    optionB: 'Opción B – Paquete alojado internamente (CRX)',
    optionBSteps: [
      'Descomprimir el paquete y empaquetarlo como CRX: `chrome://extensions` → Modo de desarrollador → Empaquetar extensión. Conserve el archivo .pem generado: determina el ID de la extensión.',
      'Colocar el archivo .crx y un manifiesto de actualización (`updates.xml`) en un servidor web HTTPS interno',
      'Forzar la instalación con `EXTENSION_ID;https://intranet.example.com/pastegate/updates.xml` (opción A, `update_url`, o ExtensionInstallForcelist)',
      'Asignar el perfil a los grupos de dispositivos de destino',
    ],
  },
  jamf: {
    steps: [
      'Jamf Pro → Computers → Configuration Profiles → New',
      'Application & Custom Settings → Upload · Preference domain: `com.google.Chrome`',
      'Property list para la instalación forzada:',
    ],
    configLead: 'Para la configuración administrada, añada una segunda payload con el preference domain `com.google.Chrome.extensions.EXTENSION_ID`:',
    scope: 'Scope: los grupos de equipos que deben recibir el despliegue.',
  },
  gpo: {
    steps: [
      'Descargar las plantillas ADMX de Chrome y copiarlas en el almacén central (SYSVOL → PolicyDefinitions)',
      'Administración de directivas de grupo → Configuración del equipo → Directivas → Plantillas administrativas → Google Chrome → Extensions',
      '**Configure the list of force-installed apps and extensions** → añadir `EXTENSION_ID;UPDATE_URL`',
    ],
    configLead: 'Configuración administrada (opcional): Configuración del equipo → Preferencias → Configuración de Windows → Registro, crear estos valores:',
  },
  manual: {
    title: 'Manual (desarrollo / pruebas)',
    steps: [
      'Descargar y descomprimir el paquete',
      'Chrome → `chrome://extensions` → activar el modo de desarrollador',
      '«Cargar descomprimida» → seleccionar la carpeta `extension/`',
      'La extensión está activa; no hace falta ninguna otra configuración',
    ],
    note: 'Para un despliegue en producción recomendamos MDM: con una instalación manual, los usuarios pueden eliminar la extensión.',
  },
  language: {
    title: 'Idioma de la extensión',
    paragraphs: [
      'La extensión sigue el idioma de la organización, que se define en el asistente de configuración y en **Configuración → Idioma de la organización**. Las extensiones desplegadas aplican el cambio automáticamente en la siguiente consulta de su configuración (`GET /api/v1/config`, campo `default_lang`); no hace falta un nuevo despliegue.',
      'Los usuarios finales pueden alternar entre el idioma de la organización y el inglés en la ventana emergente de la extensión.',
      'En la configuración administrada, la clave `lang` acepta `de`, `en`, `fr` y `es`. Si se omite, se aplica el idioma de la organización.',
    ],
  },
  bestPractice: {
    title: 'Buena práctica – API keys:',
    text: 'Cree una clave base distinta por departamento o sede. Cada paquete generado a partir de ella recibe su propia clave de despliegue, que aparece bajo la clave base en **API keys**. En un nuevo despliegue, active «Revocar claves de despliegue anteriores» para que los paquetes antiguos dejen de enviar eventos. Si sospecha que una clave está comprometida, revoque la clave base: todas sus claves de despliegue se revocan con ella, sin afectar a otros grupos.',
  },
}

export default es
