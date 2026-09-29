# app/main.py

import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError, OperationalError

from app import __version__
from app.core.config import get_settings
from app.core.database import Base, engine, SessionLocal
from app.core import ratelimit, retention
from app.core.i18n import _, parse_accept_language, request_lang, translate
from app.core.logging import configure_logging, new_request_id, request_id_var
from app.api import admin, auth, config, custom_rules, data, events, meta, setup, sso

settings = get_settings()

# ── Login rate limit (per client IP, shared across all workers) ───
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX    = 10


# ── Cleanup / data minimisation ───────────────────────────────────
# At startup and every 6 h afterwards (see app/core/retention.py).

def run_startup_cleanup() -> dict | None:
    with SessionLocal() as db:
        return retention.run_cleanup(db)


async def _cleanup_loop(log) -> None:
    while True:
        await asyncio.sleep(retention.INTERVAL_SECONDS)
        try:
            await run_in_threadpool(run_startup_cleanup)
        except Exception:
            log.warning('Cleanup failed – will retry later.', extra={'event': 'cleanup_failed'})


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(debug=settings.debug)
    import logging
    log = logging.getLogger('pastegate')
    log.info('startup', extra={'event': 'startup', 'version': app.version})

    Base.metadata.create_all(bind=engine)
    try:
        run_startup_cleanup()
    except Exception:
        log.warning('Startup cleanup failed – ignored.', extra={'event': 'startup_cleanup_failed'})
    cleanup_task = asyncio.create_task(_cleanup_loop(log))
    yield
    cleanup_task.cancel()
    log.info('shutdown', extra={'event': 'shutdown'})


app = FastAPI(
    title='Pastegate API',
    version=__version__,
    docs_url='/api/docs' if settings.debug else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────
# Dashboard origin explicitly; extensions go through allow_origin_regex (not via
# wildcard literals in allow_origins – Starlette ignores those).
# If no server_url is set (default/dev), '*' remains as a fallback.
allowed_origins = [settings.server_url] if settings.server_url else ['*']

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r'^(chrome-extension|moz-extension)://.*$',
    allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allow_headers=['Authorization', 'Content-Type', 'X-API-Key', 'Accept-Language'],
)

# ── Exception handlers ────────────────────────────────────────────
# Language taken directly from the header: the generic 500 handler runs outside the
# middleware chain, where request_lang has already been reset.

def _req_lang(request: Request) -> str:
    return parse_accept_language(request.headers.get('accept-language'))


@app.exception_handler(OperationalError)
async def db_operational_error(request: Request, exc: OperationalError):
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={'detail': translate('errors.db_unavailable', _req_lang(request))},
    )

@app.exception_handler(SQLAlchemyError)
async def db_error(request: Request, exc: SQLAlchemyError):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={'detail': translate('errors.db_internal', _req_lang(request))},
    )

@app.exception_handler(Exception)
async def generic_error(request: Request, exc: Exception):
    if settings.debug:
        raise exc
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={'detail': translate('errors.internal', _req_lang(request))},
    )

# ── Request ID middleware ─────────────────────────────────────────

@app.middleware('http')
async def request_id_middleware(request: Request, call_next):
    """Set a request ID per request and write it to the response headers.
    If the client sends an X-Request-ID header, that value is used."""
    rid = request.headers.get('X-Request-ID') or new_request_id()
    token = request_id_var.set(rid)
    try:
        import time, logging
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000, 1)

        # Access log only for API endpoints, not for static assets
        if request.url.path.startswith('/api/'):
            logging.getLogger('pastegate.access').info(
                f'{request.method} {request.url.path} {response.status_code}',
                extra={
                    'event':       'http_request',
                    'method':      request.method,
                    'path':        request.url.path,
                    'status':      response.status_code,
                    'duration_ms': duration_ms,
                    'client_ip':   request.client.host if request.client else None,
                },
            )

        response.headers['X-Request-ID'] = rid
        return response
    finally:
        request_id_var.reset(token)


# ── Rate limiting middleware ──────────────────────────────────────

def _login_rate_limited(ip: str) -> bool:
    with SessionLocal() as db:
        return ratelimit.hit(db, f'login:{ip}', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)


@app.middleware('http')
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in ('/api/v1/auth/login', '/api/v1/auth/ldap/login'):
        ip = request.client.host if request.client else 'unknown'
        try:
            limited = await run_in_threadpool(_login_rate_limited, ip)
        except SQLAlchemyError:
            # DB down → login fails anyway; do not additionally block with a 500
            limited = False
        if limited:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={'detail': _('auth.too_many_login_attempts', seconds=RATE_LIMIT_WINDOW)},
                headers={'Retry-After': str(RATE_LIMIT_WINDOW)},
            )
    return await call_next(request)


# ── Language middleware ───────────────────────────────────────────
# Registered last = outermost middleware → also applies to the 429 above.

@app.middleware('http')
async def language_middleware(request: Request, call_next):
    lang = parse_accept_language(request.headers.get('accept-language'))
    token = request_lang.set(lang)
    try:
        response = await call_next(request)
    finally:
        request_lang.reset(token)
    if request.url.path.startswith('/api/'):
        response.headers['Content-Language'] = lang
        response.headers['Vary'] = ', '.join(filter(None, [response.headers.get('Vary'), 'Accept-Language']))
    return response


# ── Router ────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(config.router)
app.include_router(events.router)
app.include_router(admin.router)
app.include_router(data.router)
app.include_router(custom_rules.router)
app.include_router(sso.router)
app.include_router(setup.router)
app.include_router(meta.router)


@app.get('/api/v1/ping')
def ping():
    return {'pong': True}


@app.get('/api/v1/healthz')
def healthz():
    """
    Liveness/readiness check for monitoring (Uptime Kuma, Wazuh, Kubernetes).
    Public — no auth required so external monitoring tools can use it.
    Returns 200 if the DB is reachable, 503 otherwise.
    """
    import time
    start = time.monotonic()
    db_ok = False
    db_error = None
    try:
        with SessionLocal() as db:
            from sqlalchemy import text as _text
            db.execute(_text('SELECT 1'))
            db_ok = True
    except Exception as e:
        db_error = type(e).__name__

    db_latency_ms = round((time.monotonic() - start) * 1000, 1)

    payload = {
        'status':        'ok' if db_ok else 'degraded',
        'version':       app.version,
        'db':            {'ok': db_ok, 'latency_ms': db_latency_ms},
    }
    if db_error:
        payload['db']['error_type'] = db_error

    if not db_ok:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload


# ── SPA / static files ────────────────────────────────────────────
# Serves the built dashboard if a static/ build is present.
# Relevant for container deployments (the app serves the SPA itself). In the
# native setup nginx serves '/' directly, so this mount never applies there.
import os as _os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

_STATIC_DIR   = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'static')
_ASSETS_DIR   = _os.path.join(_STATIC_DIR, 'assets')
_INDEX_HTML   = _os.path.join(_STATIC_DIR, 'index.html')

if _os.path.isdir(_ASSETS_DIR):
    app.mount('/assets', StaticFiles(directory=_ASSETS_DIR), name='assets')


@app.get('/{full_path:path}')
def spa_fallback(full_path: str):
    """SPA fallback: unknown (non-API) paths return index.html so that
    client-side routing (e.g. /setup, /dashboard) also works on reload."""
    if full_path.startswith('api/'):
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={'detail': _('errors.not_found')})
    if _os.path.isfile(_INDEX_HTML):
        return FileResponse(_INDEX_HTML)
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={'detail': 'Not found'})
