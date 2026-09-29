import type { MdmDoc } from './types'

const en: MdmDoc = {
  intro: 'How to roll out the Pastegate extension centrally with an MDM system. Users do not need to configure anything — everything is managed centrally.',
  step1: {
    title: 'Step 1 – Generate the extension package',
    lead: 'In the dashboard under **Build extension**:',
    steps: [
      'Select a base API key (recommended: one per department or rollout group)',
      'Choose the language — defaults to the organisation language',
      'Check the server URL: devices must reach it over HTTPS with a valid certificate',
      'Click "Download extension package"',
    ],
    zipNote: 'The ZIP contains the extension with an embedded `config.js`. Every build creates a new deploy key that is linked to the selected base key:',
  },
  intune: {
    optionA: 'Option A – Force install via settings catalog (recommended)',
    optionALead: 'Intune installs the extension through Chrome policy; users cannot remove it.',
    optionASteps: [
      'Intune → Devices → Configuration → Create → New policy',
      'Platform: Windows 10 and later · Profile type: Settings catalog',
      'Add setting: Google Chrome → Extensions → `Configure extension management settings`',
      'Enter the JSON below (replace `EXTENSION_ID`):',
    ],
    webStoreNote: 'The update URL above is the Chrome Web Store. For a self-hosted package, use the URL of your own update manifest instead (see option B).',
    configTitle: 'Managed configuration (optional)',
    configLead: 'Chrome reads managed configuration for extensions from the `3rdparty` policy key. Deploy these registry values, for example with an Intune PowerShell script (Devices → Scripts and remediations):',
    precedenceNote: 'Values embedded by the extension builder (`config.js`) take precedence. Managed configuration only fills fields the package does not contain, so it is mainly needed for a generic package without an embedded key.',
    optionB: 'Option B – Self-hosted package (CRX)',
    optionBSteps: [
      'Unzip the package and pack it as CRX: `chrome://extensions` → Developer mode → Pack extension. Keep the generated .pem file — it determines the extension ID.',
      'Put the .crx file and an update manifest (`updates.xml`) on an internal HTTPS web server',
      'Force install it with `EXTENSION_ID;https://intranet.example.com/pastegate/updates.xml` (option A, `update_url`, or ExtensionInstallForcelist)',
      'Assign the profile to the target device groups',
    ],
  },
  jamf: {
    steps: [
      'Jamf Pro → Computers → Configuration Profiles → New',
      'Application & Custom Settings → Upload · Preference domain: `com.google.Chrome`',
      'Property list for the force install:',
    ],
    configLead: 'For the managed configuration, add a second payload with preference domain `com.google.Chrome.extensions.EXTENSION_ID`:',
    scope: 'Scope: the computer groups that should receive the rollout.',
  },
  gpo: {
    steps: [
      'Download the Chrome ADMX templates and copy them to the central store (SYSVOL → PolicyDefinitions)',
      'Group Policy Management → Computer Configuration → Policies → Administrative Templates → Google Chrome → Extensions',
      '**Configure the list of force-installed apps and extensions** → add `EXTENSION_ID;UPDATE_URL`',
    ],
    configLead: 'Managed configuration (optional): Computer Configuration → Preferences → Windows Settings → Registry, create these values:',
  },
  manual: {
    title: 'Manual (development / test)',
    steps: [
      'Download and unzip the package',
      'Chrome → `chrome://extensions` → enable Developer mode',
      '"Load unpacked" → select the `extension/` folder',
      'The extension is active — no further configuration needed',
    ],
    note: 'For a production rollout we recommend MDM: a manual installation lets users remove the extension.',
  },
  language: {
    title: 'Extension language',
    paragraphs: [
      'The extension follows the organisation language, which is set in the setup wizard and under **Settings → Organisation language**. Deployed extensions pick up a change automatically with their next configuration fetch (`GET /api/v1/config`, field `default_lang`) — no new rollout is needed.',
      'End users can switch between the organisation language and English in the extension popup.',
      'In managed configuration, the key `lang` accepts `de`, `en`, `fr` and `es`. If it is omitted, the organisation language applies.',
    ],
  },
  bestPractice: {
    title: 'Best practice – API keys:',
    text: 'Create a separate base key per department or location. Every package built from it gets its own deploy key, listed under the base key in **API keys**. For a re-rollout, enable "Revoke previous deploy keys" so older packages stop reporting. If you suspect a compromise, revoke the base key: all of its deploy keys are revoked with it, without affecting other groups.',
  },
}

export default en
