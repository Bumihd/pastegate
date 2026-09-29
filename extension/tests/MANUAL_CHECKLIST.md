# Pastegate — Manual Verification Checklist (real SaaS editors)

These editors cannot be reliably reproduced locally and must be verified **manually**
on the real site. Prerequisite: extension installed and configured against a
reachable server (`config.js` from "Build Extension" or MDM).

**Test values** (trigger detection, not real secrets):
- AWS key: `AKIAIOSFODNN7EXAMPLE`
- Generic "secret": `password = SuperSecret123!`
- IBAN: `DE89 3704 0044 0532 0130 00`

**Always check per editor:**
1. **Detection** — the Pastegate overlay appears on paste.
2. **Block** — click "Block": the text is **not** inserted.
3. **Paste anyway** — click: the text appears at the cursor position.
4. **Selection** — if text was selected beforehand, it is replaced correctly / the cursor ends up in the right place.
5. **Focus** — after the click, focus remains in the editing field.
6. **Event** — the event appears in the dashboard under "Events" within < 250 ms.

---

## Checklist

| # | Platform | Editor engine | Detected | Block | Insert | Selection | Focus | Event in dashboard | Status |
|---|-----------|---------------|:------:|:-----:|:------:|:--------:|:-----:|:------------------:|--------|
| 1 | ChatGPT (chatgpt.com) — prompt input | ProseMirror/contenteditable | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2 | Outlook Web (outlook.office.com) — compose mail | Lexical | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 3 | Microsoft Teams — chat input | ProseMirror | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 4 | Google Docs — document | proprietary (canvas/contenteditable) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 5 | Gmail — compose mail | contenteditable | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 6 | GitHub — issue/PR comment | `<textarea>` / CodeMirror | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 7 | GitLab — comment | `<textarea>` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 8 | Notion — page | ProseMirror-like | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 9 | Slack — message input | Slate/contenteditable | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 10 | Jira/Confluence — comment | ProseMirror | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 11 | VS Code Web (vscode.dev) | Monaco | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 12 | Salesforce — notes field | Quill/contenteditable | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |

> Note: SaaS editors change their implementation from time to time; on a failure,
> inspect the DOM markers via DevTools (`data-lexical-editor`, `.ProseMirror`, `.cm-editor`, …)
> and extend `editor-detect.js` if needed.

## Service worker / connectivity

- [ ] HTTPS server: extension connects without the 301 redirect problem (MV3 does not reliably follow 301).
- [ ] Internal HTTP server (192.168.*/10.*/localhost): stays `http://` (no forced HTTPS upgrade).
- [ ] In the service worker console, `await pgDiagnose()` shows `connection.ok = true`.
- [ ] Event delivery < 250 ms (overlay triggers an immediate flush).
- [ ] Popup shows correct server status + pending queue (status display only, no config panel).

## Language (org language from the dashboard)

Resolution: `/config` `default_lang` > MDM `lang` > `config.js` `lang` > `en`.
In the popup, the user can only choose between the org language and English. Check status at any time via
`await pgDiagnose()` (`config.lang`, `org_lang`, `org_lang_server`, `lang_override`).

- [ ] Set dashboard language to French, rebuild/reinstall the extension: popup texts in French,
      switcher shows "Français" (active) and "English".
- [ ] Overlay (paste the AWS test key): title, severity, rule name/description and buttons in French.
- [ ] Switch popup to "English": popup immediately in English; next overlay in the open tab in English
      (without reload).
- [ ] Change dashboard language to Spanish, run `await syncConfig()` in the SW (or wait 60 min):
      popup shows "Español" / "English"; a previously chosen "English" stays active.
- [ ] With override "Français", change the dashboard language to Spanish: extension switches to Spanish
      (the old override is ignored).
- [ ] Dashboard language English: no language switcher in the popup, everything in English.
- [ ] Server unreachable / older server without `default_lang`: language from MDM or `config.js`.
- [ ] Update from v1.5.3 with a previously chosen "EN" (config.js `de`): stays English.

## Organization rules (dashboard -> `/config` `custom_rules`)

- [ ] Create a rule in the dashboard (e.g. pattern `KD-\d{6}`, severity high), run `await syncConfig()` in the SW:
      `await pgDiagnose()` shows `custom_rules.received = 1`, `custom_rules.active = 1`.
- [ ] Paste `KD-123456` into a text field: overlay shows name and description exactly as in the dashboard
      (regardless of UI language), without reloading the tab.
- [ ] Event appears in the dashboard with the rule's `rule_id` (`custom_…`) and its severity.
- [ ] Rule with an invalid pattern (e.g. `(`): `active` < `received`, all other rules keep working.
- [ ] Delete the rule in the dashboard, `syncConfig()`: no more overlay for `KD-123456`.
- [ ] Older server without `custom_rules`: built-in rules only, no errors in the SW console.

## MDM (chrome.storage.managed)

- [ ] Chrome: set a policy with `server_url`/`api_key`/`lang` (`manifest.json` -> `storage.managed_schema`),
      `chrome://policy` shows the values without schema errors; the extension picks them up.
- [ ] Firefox: without a managed manifest the extension starts without errors (managed storage access is guarded).
