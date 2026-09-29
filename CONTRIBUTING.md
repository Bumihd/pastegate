# Contributing to Pastegate

Thanks for your interest in improving Pastegate. This guide covers local setup
and the checks CI runs on every change.

## Repository layout

```
extension/   Chrome/Edge MV3 extension (local detection)
backend/     FastAPI + PostgreSQL (auth, event ingest, stats, extension builder)
dashboard/   React + Vite + TypeScript admin/reporting UI
docs/        DESIGN.md (UI spec)
install.sh / uninstall.sh   Distro-agnostic installer / uninstaller
```

## Local development

### Backend
```bash
cd backend
python -m venv ../venv && source ../venv/bin/activate
pip install -r requirements.txt
# configure backend/.env from backend/.env.example
uvicorn app.main:app --reload
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev          # proxies /api to http://127.0.0.1:8000
npm run build        # outputs into backend/static
```

### Extension
Load `extension/` as an unpacked extension via `chrome://extensions`
(developer mode). An admin-built package embeds `config.js`
(server URL + API key); never commit a generated `config.js`.

## Checks (run before opening a PR)

These mirror CI:

```bash
# backend imports cleanly
cd backend && python -c "from app.main import app"

# dashboard typechecks and builds
cd dashboard && npx tsc --noEmit && npm run build

# extension detection tests
node extension/tests/detect.test.js
```

## Conventions

- **Database**: schema changes only via Alembic migrations, never manual SQL.
- **Secrets**: never commit `.env`, `SETUP_TOKEN`, generated `extension/config.js`
  or `*.pem/*.key`. They are gitignored — keep it that way.
- **i18n**: every new UI string must exist in **both** German and English in
  `dashboard/src/lib/i18n.ts`, otherwise the UI shows the raw key.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:` …).
- **Security**: see [SECURITY.md](SECURITY.md). Do not reintroduce a third-party
  service for TOTP QR rendering — it is rendered server-side on purpose.
