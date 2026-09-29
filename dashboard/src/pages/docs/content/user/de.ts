import type { UserDoc } from './types'

const de: UserDoc = {
  sections: {
    getting_started: {
      title: 'Erste Schritte',
      items: {
        what: {
          heading: 'Was ist Pastegate?',
          text: 'Pastegate ist eine Browser-Extension, die verhindert, dass sensible Daten (Passwörter, API-Keys, Kreditkartennummern, persönliche Dokumente) versehentlich in externe Websites eingefügt werden. Sie läuft im Hintergrund, prüft die Zwischenablage automatisch bei jedem Einfügen und warnt den User, bevor etwas eingefügt wird.',
        },
        detection: {
          heading: 'Wie funktioniert die Erkennung?',
          text: 'Pastegate verwendet über 80 regelbasierte Muster (reguläre Ausdrücke), die lokal im Browser ausgeführt werden. Kein Klartext verlässt den Client. An den Server gehen nur anonymisierte Metadaten: Regel und Schweregrad, die ausgeführte Aktion, die Domain (z. B. claude.ai) und ein SHA-256-Hash der vollständigen URL.',
        },
        severity: {
          heading: 'Schweregrade',
          text: 'Kritisch: AWS/GCP/Azure-Keys, Private Keys, Passwörter im Klartext\nHoch: GitHub/GitLab-Tokens, JWTs, allgemeine API-Keys\nMittel: E-Mail-Adressen, IBANs, Kreditkartennummern\nNiedrig: möglicherweise sensible Inhalte (heuristische Erkennung)',
        },
        language: {
          heading: 'Sprache der Extension',
          text: 'Die Extension verwendet die Organisationssprache, die Ihre Administratoren festgelegt haben. User können im Extension-Popup jederzeit zwischen der Organisationssprache und Englisch wechseln.',
        },
      },
    },
    admin: {
      title: 'Admin-Handbuch',
      items: {
        install: {
          heading: 'Installation',
          text: 'Pastegate wird mit einem einzigen Script installiert. Es richtet PostgreSQL, das FastAPI-Backend, das React-Dashboard und nginx automatisch ein.',
          code: 'sudo bash install.sh',
        },
        org_language: {
          heading: 'Organisationssprache',
          text: 'Die Organisationssprache wird im Setup-Wizard gewählt und kann später unter **Einstellungen → Organisationssprache** geändert werden. Sie ist der Standard für das Dashboard und für jede verteilte Extension.\n\nVerteilte Extensions übernehmen eine Änderung automatisch beim nächsten Abruf ihrer Konfiguration (`GET /api/v1/config`, Feld `default_lang`) — ein Neubau oder erneutes Verteilen ist nicht nötig. User können im Extension-Popup weiterhin zwischen Organisationssprache und Englisch wechseln.',
        },
        build: {
          heading: 'Extension-Paket generieren',
          text: 'Unter **Extension bauen** einen Basis-API-Key, die Sprache (Standard: Organisationssprache) und die Server-URL auswählen. Das generierte ZIP enthält die Extension mit bereits eingebetteter Server-URL und eingebettetem Key — User müssen nichts konfigurieren.\n\nJeder Build erzeugt einen neuen Deploy-Key, der mit dem gewählten Basis-Key verknüpft ist. Bei einem Neu-Rollout können die früheren Deploy-Keys dieses Basis-Keys gleich mit widerrufen werden; Extensions, die noch mit diesen Keys laufen, melden dann nicht mehr.',
        },
        mdm: {
          heading: 'MDM-Deployment (Intune, Jamf, GPO)',
          text: '1. Extension per Chrome-Policy zwangsinstallieren (ExtensionInstallForcelist oder ExtensionSettings)\n2. Optional `server_url`, `api_key` und `lang` (de, en, fr, es) als verwaltete Konfiguration der Extension setzen\n3. Policy den Ziel-Gerätegruppen zuweisen\n\nDetails: siehe MDM-Guide im Dashboard.',
        },
        api_keys: {
          heading: 'API-Keys verwalten',
          text: 'Empfehlung: ein Basis-Key pro Abteilung oder Standort. Die vom Extension-Builder erzeugten Deploy-Keys werden unter ihrem Basis-Key gruppiert. Bei Kompromittierung den Basis-Key widerrufen: Alle zugehörigen Deploy-Keys werden mit widerrufen, andere Gruppen bleiben unberührt.\n\nKeys werden nur als HMAC-SHA256-Hash gespeichert — der Klartext-Key ist einmalig beim Erstellen sichtbar.',
        },
        users: {
          heading: 'Benutzer anlegen',
          text: 'Unter **Benutzer → Benutzer anlegen** einen neuen Account erstellen. Die Rolle sorgfältig wählen — itsec und infosec haben Zugriff auf alle Event-Details. Empfehlung: 2FA für alle privilegierten Rollen aktivieren.',
        },
      },
    },
    itsec: {
      title: 'IT-Security-Handbuch',
      items: {
        events: {
          heading: 'Event-Auswertung',
          text: 'Unter **Events** sind alle Paste-Ereignisse chronologisch aufgelistet. Filtern lässt sich nach Aktion (blocked, blocked_hard, allowed) und Schweregrad; die Spalte „App / Host" zeigt die Ziel-Domain. Besondere Aufmerksamkeit verdient `action=allowed`: Der User hat die Warnung bewusst übergangen.',
        },
        domain_rules: {
          heading: 'Domain-Regeln',
          text: 'Unter **Domain-Regeln** kann jede Domain auf einen von drei Modi gesetzt werden:\n\n• warn: Warnung erscheint, Einfügen bleibt möglich (Standard)\n• hard_block: Warnung erscheint, kein Übergehen möglich (z. B. ChatGPT, Pastebin)\n• allow: kein Scan, keine Warnung (interne Tools wie Jira oder Confluence)\n\nWildcards: `*.chatgpt.com` deckt alle Subdomains ab.',
        },
        identity: {
          heading: 'Klarnamen anzeigen',
          text: 'Events und Geräte erscheinen für alle Rollen nur als Device-Hash. itsec- und infosec-User können unter **Geräte** oder **Events** per „Klarname anzeigen" sehen, wem ein Gerät gehört (Profil-E-Mail bzw. per MDM gesetzte Identität, ab Extension 2.1).\n\nEin Antrag ist nicht nötig, aber jeder Abruf wird mit Benutzername, Gerät, Zeit und IP im Audit-Log protokolliert und ist für den Datenschutz sichtbar.',
        },
        incident: {
          heading: 'Incident Response',
          text: 'Bei Verdacht auf eine Datenpanne:\n1. Events nach action=allowed filtern\n2. Schweregrad „kritisch" priorisieren\n3. Betroffenes Gerät per „Klarname anzeigen" identifizieren\n4. Audit-Log zur Dokumentation exportieren (CSV über DSGVO-Reports)',
        },
      },
    },
    management: {
      title: 'Management-Handbuch',
      items: {
        risk: {
          heading: 'Risk-Map verstehen',
          text: 'Der Risk-Score (0–100) fasst alle Events nach Schweregrad zusammen. Kritische Events werden 4-fach, hohe 2-fach gewichtet. Ein Score über 70 erfordert die Aufmerksamkeit des IT-Security-Teams.',
        },
        trend: {
          heading: 'Monatstrend interpretieren',
          text: 'Ein Anstieg der Events kann zweierlei bedeuten:\n• mehr Versuche, sensible Daten einzufügen (negativ)\n• höhere Awareness nach Schulungen (positiv, weil User gewarnt werden)\n\nZusammen mit der Quote von action=allowed wird der Trend deutlich aussagekräftiger.',
        },
      },
    },
    dataprivacy: {
      title: 'Datenschutz-Handbuch',
      items: {
        gdpr: {
          heading: 'DSGVO-Konformität',
          text: 'Pastegate speichert keine eingefügten Inhalte. Device-Hashes sind HMAC-SHA256-Werte mit serverseitigem Salt und ohne diesen nicht umkehrbar. Die Identität des Geräts (E-Mail) liegt nur AES-GCM-verschlüsselt in der Datenbank und ist ausschließlich für itsec/infosec lesbar. URLs werden als SHA-256-Hash gespeichert; nur die Domain bleibt für die Triage im Klartext. Keine Snippets.',
        },
        audit: {
          heading: 'Audit-Log',
          text: 'Das Audit-Log protokolliert alle sicherheitsrelevanten Aktionen mit Benutzernamen, insbesondere:\n• jeden Klarnamen-Abruf (wer hat wann die Identität welches Geräts angesehen)\n• Anmeldungen\n\nDas Log ist unveränderlich und kann als CSV exportiert werden.',
        },
        access: {
          heading: 'Auskunftsrecht (Art. 15 DSGVO)',
          text: 'Auf Anfrage können alle Events eines bestimmten Geräts über seinen Device-Hash identifiziert werden. Die Zuordnung des Hashes zu einer Person können nur itsec/infosec sehen; jeder Abruf wird im Audit-Log protokolliert.',
        },
        erasure: {
          heading: 'Recht auf Löschung (Art. 17 DSGVO)',
          text: 'Pastegate ist ein Sicherheits-Audit-System. Events werden nach der konfigurierten Aufbewahrungsfrist (Standard: 90 Tage) automatisch gelöscht. Geräte, deren Extension sich 30 Tage nicht gemeldet hat, werden samt aller Events und der verschlüsselten Identität vollständig entfernt (`DEVICE_RETENTION_DAYS`, 0 = aus). Die Prüfung läuft beim Start und alle 6 Stunden. Eine manuelle Sofortlöschung einzelner Events ist bewusst nicht vorgesehen, da sie die Integrität des Audit-Trails gefährden würde.',
        },
      },
    },
  },
}

export default de
