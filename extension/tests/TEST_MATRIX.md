# Pastegate — Extension Test Matrix

Audit of the paste bypass logic across all target types. Columns:

- **Detected** — `detectEditorType()` returns the correct type (or `null` for native targets that go through the native path).
- **Selection restored** — cursor/selection stays at the insertion point.
- **Insert ok** — "Paste anyway" actually inserts the text.
- **Focus kept** — after the click, focus stays in the editing field.

Legend: ✅ green · ⚙️ automated (Node harness) · 🧪 manual in the harness (`editor-harness.html`) · 📋 only on the real SaaS site (see `MANUAL_CHECKLIST.md`).

## Automated (Node harness, `detect.test.js`) — 123/123 green

Covers editor detection (15), detection rules (positive and near-miss cases per new
rule, check digits against reference numbers) and organization rules (see below).

The **Detected** column is fully covered by automated tests (marker detection,
ancestor walk up to 8 levels, priority, negative cases).

| Editor type              | Detected | Selection restored | Insert ok | Focus kept | Insert path |
|--------------------------|:------:|:--------------------------:|:--------:|:--------------:|-------------|
| `<input>`                | ✅⚙️ (null → native) | 🧪 | 🧪 | 🧪 | value setter + reset cursor |
| `<textarea>`             | ✅⚙️ (null → native) | 🧪 | 🧪 | 🧪 | value setter + reset cursor |
| generic contenteditable  | ✅⚙️ (null → CE path) | 🧪 | 🧪 | 🧪 | Selection API → execCommand → synthetic paste |
| ProseMirror / TipTap     | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput(insertFromPaste) → synthetic paste |
| Lexical                  | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput → synthetic paste |
| Slate                    | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput → synthetic paste |
| CodeMirror v5/v6         | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput → execCommand |
| Monaco                   | ✅⚙️ | 🧪 | 🧪 | 🧪 | inputarea (textarea) → native insert; otherwise beforeinput |
| Quill                    | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput → synthetic paste |
| Draft.js                 | ✅⚙️ | 🧪 | 🧪 | 🧪 | beforeinput → synthetic paste |

## Organization rules (`custom_rules` from `/api/v1/config`)

background.js stores `custom_rules` in `chrome.storage.local`; content.js compiles them
with `compileCustomRules()` (custom-rules.js) and scans them together with the built-in rules.
Automated in `detect.test.js`:

- Compiled with `new RegExp(pattern, flags)` in try/catch; invalid patterns are skipped
- `g` is forced, only flags `i m s u` are kept (`y` is dropped)
- missing `rule_id`/`pattern`, `rule_id` > 64 characters (backend limit), duplicate IDs, patterns > 2000 characters are skipped; max. 200 rules
- unknown severity -> `medium`; missing name -> `rule_id`
- empty matches (`x*`, `(?:)`, lookahead) do not hang and produce no finding
- max. 50 checked matches per rule; `MAX_SCAN_LEN` also applies to organization rules
- the finding carries `rule_id` unchanged, `custom: true`, name/description from the server

## Manual in the harness (`editor-harness.html`)

1. Load the extension (`chrome://extensions` → Developer mode → "Load unpacked"
   → `extension/`). For `file://`, enable "Allow access to file URLs".
2. Open `editor-harness.html`. The detection table at the top must show **detected** for every row
   (the tab title starts with ✓).
3. Paste a test value into each field, e.g. `AKIAIOSFODNN7EXAMPLE` (AWS key, critical).
4. Check per field: overlay appears → **Block** inserts nothing →
   paste again → **Paste anyway** inserts at the cursor position,
   focus stays in the field. Tick off the columns in this file.

## Known fixes in this pass

- **Focus bug fixed:** `mousedown` preventDefault on the overlay buttons
  (Block + "Paste anyway"). Without this fix the button click took
  focus/selection away from the editing target, so the subsequent insert
  failed in contenteditable/framework editors.
- **Backend enum `blocked_hard`:** the extension reports `action='blocked_hard'`
  for hard_block domains; the value was missing from the `eventaction` enum → whole batches
  were rejected with 422. Added via an Alembic migration.

## Checked regressions

- no duplicate `pyotp` import in auth.py — checked, only one import.
- `importScripts('config.js')` in background.js is clean (no garbage after catch).
- The extension builder writes `config.js` inside the `tempfile.TemporaryDirectory()` block.
- `qrcode` is in requirements.txt (imported server-side): the TOTP QR code
  is now rendered server-side as an SVG data URI, no external service anymore.
- `blocked_hard` is now present in the EventAction enum.

## Environment

Browser automation (Playwright/Chromium) was **not available** in this environment
(`npx playwright` missing, no Chromium binary). Detection is automated via the
Node harness; insert/selection/focus can be reproduced manually via the HTML
harness. When browser automation is available, `editor-harness.html` can be
driven directly with Playwright.
