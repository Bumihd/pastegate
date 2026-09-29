import type { MdmDoc } from './types'

const de: MdmDoc = {
  intro: 'Anleitung zum zentralen Rollout der Pastegate-Extension über ein MDM-System. User müssen nichts konfigurieren — alles wird zentral gesteuert.',
  step1: {
    title: 'Schritt 1 – Extension-Paket generieren',
    lead: 'Im Dashboard unter **Extension bauen**:',
    steps: [
      'Basis-API-Key auswählen (Empfehlung: einer pro Abteilung oder Rollout-Gruppe)',
      'Sprache wählen — Standard ist die Organisationssprache',
      'Server-URL prüfen: Die Geräte müssen sie per HTTPS mit gültigem Zertifikat erreichen',
      '„Extension-Paket herunterladen" klicken',
    ],
    zipNote: 'Das ZIP enthält die Extension mit eingebetteter `config.js`. Jeder Build erzeugt einen neuen Deploy-Key, der mit dem gewählten Basis-Key verknüpft ist:',
  },
  intune: {
    optionA: 'Option A – Zwangsinstallation über den Einstellungskatalog (empfohlen)',
    optionALead: 'Intune installiert die Extension per Chrome-Policy; User können sie nicht entfernen.',
    optionASteps: [
      'Intune → Geräte → Konfiguration → Erstellen → Neue Richtlinie',
      'Plattform: Windows 10 und höher · Profiltyp: Einstellungskatalog',
      'Einstellung hinzufügen: Google Chrome → Extensions → `Configure extension management settings`',
      'Folgendes JSON eintragen (`EXTENSION_ID` ersetzen):',
    ],
    webStoreNote: 'Die Update-URL oben ist der Chrome Web Store. Für ein selbst gehostetes Paket stattdessen die URL des eigenen Update-Manifests eintragen (siehe Option B).',
    configTitle: 'Verwaltete Konfiguration (optional)',
    configLead: 'Chrome liest die verwaltete Konfiguration von Extensions aus dem Policy-Schlüssel `3rdparty`. Diese Registry-Werte verteilen, z. B. per Intune-PowerShell-Script (Geräte → Skripts und Wartungen):',
    precedenceNote: 'Vom Extension-Builder eingebettete Werte (`config.js`) haben Vorrang. Die verwaltete Konfiguration füllt nur Felder, die das Paket nicht enthält — sie wird also vor allem für ein generisches Paket ohne eingebetteten Key gebraucht.',
    optionB: 'Option B – Selbst gehostetes Paket (CRX)',
    optionBSteps: [
      'ZIP entpacken und als CRX packen: `chrome://extensions` → Entwicklermodus → Erweiterung packen. Die erzeugte .pem-Datei aufbewahren — sie bestimmt die Extension-ID.',
      '.crx-Datei und ein Update-Manifest (`updates.xml`) auf einen internen HTTPS-Webserver legen',
      'Per `EXTENSION_ID;https://intranet.example.com/pastegate/updates.xml` zwangsinstallieren (Option A, `update_url`, oder ExtensionInstallForcelist)',
      'Profil den Ziel-Gerätegruppen zuweisen',
    ],
  },
  jamf: {
    steps: [
      'Jamf Pro → Computers → Configuration Profiles → New',
      'Application & Custom Settings → Upload · Preference Domain: `com.google.Chrome`',
      'Property List für die Zwangsinstallation:',
    ],
    configLead: 'Für die verwaltete Konfiguration eine zweite Payload mit der Preference Domain `com.google.Chrome.extensions.EXTENSION_ID` anlegen:',
    scope: 'Scope: die Computergruppen, die den Rollout erhalten sollen.',
  },
  gpo: {
    steps: [
      'Chrome-ADMX-Vorlagen herunterladen und in den zentralen Speicher kopieren (SYSVOL → PolicyDefinitions)',
      'Gruppenrichtlinienverwaltung → Computerkonfiguration → Richtlinien → Administrative Vorlagen → Google Chrome → Extensions',
      '**Configure the list of force-installed apps and extensions** → `EXTENSION_ID;UPDATE_URL` eintragen',
    ],
    configLead: 'Verwaltete Konfiguration (optional): Computerkonfiguration → Einstellungen → Windows-Einstellungen → Registrierung, diese Werte anlegen:',
  },
  manual: {
    title: 'Manuell (Entwicklung / Test)',
    steps: [
      'Paket herunterladen und entpacken',
      'Chrome → `chrome://extensions` → Entwicklermodus aktivieren',
      '„Entpackte Erweiterung laden" → Ordner `extension/` auswählen',
      'Die Extension ist aktiv — keine weitere Konfiguration nötig',
    ],
    note: 'Für den Produktiv-Rollout empfehlen wir MDM: Bei manueller Installation können User die Extension entfernen.',
  },
  language: {
    title: 'Sprache der Extension',
    paragraphs: [
      'Die Extension folgt der Organisationssprache, die im Setup-Wizard und unter **Einstellungen → Organisationssprache** festgelegt wird. Verteilte Extensions übernehmen eine Änderung automatisch beim nächsten Konfigurationsabruf (`GET /api/v1/config`, Feld `default_lang`) — ein neuer Rollout ist nicht nötig.',
      'End-User können im Extension-Popup zwischen der Organisationssprache und Englisch wechseln.',
      'In der verwalteten Konfiguration akzeptiert der Schlüssel `lang` die Werte `de`, `en`, `fr` und `es`. Fehlt er, gilt die Organisationssprache.',
    ],
  },
  bestPractice: {
    title: 'Best Practice – API-Keys:',
    text: 'Pro Abteilung oder Standort einen eigenen Basis-Key anlegen. Jedes daraus gebaute Paket erhält einen eigenen Deploy-Key, der unter **API-Keys** beim Basis-Key aufgeführt wird. Bei einem Neu-Rollout „Frühere Deploy-Keys widerrufen" aktivieren, damit ältere Pakete nicht mehr melden. Bei Verdacht auf Kompromittierung den Basis-Key widerrufen: Alle zugehörigen Deploy-Keys werden mit widerrufen, andere Gruppen bleiben unberührt.',
  },
}

export default de
