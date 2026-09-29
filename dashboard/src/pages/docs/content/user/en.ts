import type { UserDoc } from './types'

const en: UserDoc = {
  sections: {
    getting_started: {
      title: 'Getting started',
      items: {
        what: {
          heading: 'What is Pastegate?',
          text: 'Pastegate is a browser extension that prevents sensitive data (passwords, API keys, credit card numbers, personal documents) from being pasted into external websites by accident. It runs in the background, checks the clipboard automatically on every paste and warns the user before anything is inserted.',
        },
        detection: {
          heading: 'How does detection work?',
          text: 'Pastegate uses more than 80 rule-based patterns (regular expressions) that run locally in the browser. No clear text ever leaves the client. Only anonymised metadata is reported to the server: rule and severity, the action taken, the domain (e.g. claude.ai) and a SHA-256 hash of the full URL.',
        },
        severity: {
          heading: 'Severity levels',
          text: 'Critical: AWS/GCP/Azure keys, private keys, passwords in clear text\nHigh: GitHub/GitLab tokens, JWTs, generic API keys\nMedium: email addresses, IBANs, credit card numbers\nLow: possibly sensitive content (heuristic detection)',
        },
        language: {
          heading: 'Language of the extension',
          text: 'The extension uses the organisation language configured by your administrators. Users can switch between the organisation language and English at any time in the extension popup.',
        },
      },
    },
    admin: {
      title: 'Admin manual',
      items: {
        install: {
          heading: 'Installation',
          text: 'Pastegate is installed with a single script. It sets up PostgreSQL, the FastAPI backend, the React dashboard and nginx automatically.',
          code: 'sudo bash install.sh',
        },
        org_language: {
          heading: 'Organisation language',
          text: 'The organisation language is chosen in the setup wizard and can be changed later under **Settings → Organisation language**. It is the default for the dashboard and for every deployed extension.\n\nDeployed extensions pick up a change automatically the next time they fetch their configuration (`GET /api/v1/config`, field `default_lang`) — no rebuild or redeployment is needed. Users can still switch between the organisation language and English in the extension popup.',
        },
        build: {
          heading: 'Generate the extension package',
          text: 'Under **Build extension**, select a base API key, the language (defaults to the organisation language) and the server URL. The generated ZIP contains the extension with the server URL and a key already embedded — users do not need to configure anything.\n\nEvery build creates a new deploy key that is linked to the selected base key. For a new rollout you can revoke the earlier deploy keys of that base key at the same time; extensions still running with those keys stop reporting.',
        },
        mdm: {
          heading: 'MDM deployment (Intune, Jamf, GPO)',
          text: '1. Force-install the extension via Chrome policy (ExtensionInstallForcelist or ExtensionSettings)\n2. Optionally provide `server_url`, `api_key` and `lang` (de, en, fr, es) as managed configuration of the extension\n3. Assign the policy to the target device groups\n\nDetails: see the MDM guide in the dashboard.',
        },
        api_keys: {
          heading: 'Manage API keys',
          text: 'Recommendation: one base key per department or location. Deploy keys created by the extension builder are grouped under their base key. If a key is compromised, revoke the base key: all of its deploy keys are revoked with it, without affecting other groups.\n\nKeys are stored only as HMAC-SHA256 hashes — the raw key is visible once, at creation time.',
        },
        users: {
          heading: 'Create users',
          text: 'Create new accounts under **Users → Create user**. Choose the role carefully — itsec and infosec have access to all event details. Recommendation: enable 2FA for every privileged role.',
        },
      },
    },
    itsec: {
      title: 'IT security manual',
      items: {
        events: {
          heading: 'Event analysis',
          text: 'Under **Events**, all paste events are listed in chronological order. You can filter by action (blocked, blocked_hard, allowed) and severity; the "App / Host" column shows the target domain. Pay particular attention to `action=allowed`: the user deliberately ignored the warning.',
        },
        domain_rules: {
          heading: 'Domain rules',
          text: 'Under **Domain rules**, each domain can be set to one of three modes:\n\n• warn: a warning is shown, the user can still paste (default)\n• hard_block: a warning is shown, no bypass possible (e.g. ChatGPT, Pastebin)\n• allow: no scan, no warning (internal tools such as Jira or Confluence)\n\nWildcards: `*.chatgpt.com` covers all subdomains.',
        },
        identity: {
          heading: 'Showing identities',
          text: 'Events and devices appear as a device hash for every role. itsec and infosec users can use “Show identity” under **Devices** or **Events** to see who a device belongs to (profile e-mail or an identity set via MDM, extension 2.1 or newer).\n\nNo request is needed, but every lookup is recorded in the audit log with username, device, time and IP and is visible to data privacy.',
        },
        incident: {
          heading: 'Incident response',
          text: 'If a data breach is suspected:\n1. Filter events by action=allowed\n2. Prioritise “critical” severity\n3. Identify the affected device via “Show identity”\n4. Export the audit log for documentation (CSV via GDPR Reports)',
        },
      },
    },
    management: {
      title: 'Management manual',
      items: {
        risk: {
          heading: 'Understanding the risk map',
          text: 'The risk score (0–100) aggregates all events by severity. Critical events are weighted 4×, high events 2×. A score above 70 needs the attention of the IT security team.',
        },
        trend: {
          heading: 'Interpreting the monthly trend',
          text: 'A rise in events can mean two things:\n• more attempts to paste sensitive data (negative)\n• higher awareness after training (positive, because users are being warned)\n\nRead together with the rate of action=allowed, the trend becomes much more meaningful.',
        },
      },
    },
    dataprivacy: {
      title: 'Data protection manual',
      items: {
        gdpr: {
          heading: 'GDPR compliance',
          text: 'Pastegate never stores pasted content. Device hashes are HMAC-SHA256 values with a server-side salt and cannot be reversed without it. The device identity (e-mail) is stored AES-GCM-encrypted only and is readable by itsec/infosec alone. URLs are stored as SHA-256 hashes; only the domain stays in clear text for triage. No snippets.',
        },
        audit: {
          heading: 'Audit log',
          text: 'The audit log records all security-relevant actions with usernames, in particular:\n• every identity lookup (who viewed which device’s identity, and when)\n• logins\n\nThe log cannot be modified and can be exported as CSV.',
        },
        access: {
          heading: 'Right of access (Art. 15 GDPR)',
          text: 'On request, all events of a given device can be identified via its device hash. Only itsec/infosec can see which person a hash belongs to; every lookup is recorded in the audit log.',
        },
        erasure: {
          heading: 'Right to erasure (Art. 17 GDPR)',
          text: 'Pastegate is a security audit system. Events are deleted automatically after the configured retention period (default: 90 days). Devices whose extension has not reported for 30 days are removed completely, including all events and the encrypted identity (`DEVICE_RETENTION_DAYS`, 0 = off). The check runs at startup and every 6 hours. Immediate manual deletion of individual events is intentionally not supported, as it would compromise the integrity of the audit trail.',
        },
      },
    },
  },
}

export default en
