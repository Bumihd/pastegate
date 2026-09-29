import ast
import io
import json
import pathlib
import re
import zipfile

import pytest

from app.core import i18n
from app.core.config import get_settings
from app.core.i18n import SUPPORTED_LANGS, parse_accept_language, translate
from app.models.models import AuditLog, UserRole
from tests.test_setup import TOKEN, token_file  # noqa: F401

APP_DIR = pathlib.Path(__file__).resolve().parents[1] / 'app'
LOCALES = APP_DIR / 'locales'


# ── Accept-Language ───────────────────────────────────────────────

@pytest.mark.parametrize('header,expected', [
    (None, 'en'),
    ('', 'en'),
    ('de', 'de'),
    ('de-DE,de;q=0.9,en;q=0.8', 'de'),
    ('fr-CH, fr;q=0.9', 'fr'),
    ('es-419', 'es'),
    ('ja, zh;q=0.8', 'en'),
    ('*', 'en'),
    ('en;q=0.5, fr;q=0.9', 'fr'),
    ('ja, es;q=0.3, de;q=0.2', 'es'),
    ('fr;q=0, de;q=0.1', 'de'),
    ('de;q=abc, fr;q=0.4', 'fr'),
])
def test_parse_accept_language(header, expected):
    assert parse_accept_language(header) == expected


def test_translate_fallbacks(monkeypatch):
    assert translate('auth.forbidden_role', 'fr', roles='admin') == 'Accès refusé. Rôle requis : admin'
    assert translate('does.not.exist', 'de') == 'does.not.exist'
    # Missing key in a language → en
    monkeypatch.setitem(i18n.catalog('es'), 'errors.internal', '')
    assert translate('errors.internal', 'es') == 'Internal server error.'


@pytest.mark.parametrize('lang,expected', [
    ('de', 'Nicht authentifiziert.'),
    ('en', 'Not authenticated.'),
    ('fr-FR,fr;q=0.9', 'Non authentifié.'),
    ('es', 'No autenticado.'),
    ('pt-BR', 'Not authenticated.'),
])
def test_401_message_translated(client, lang, expected):
    r = client.get('/api/v1/auth/me', headers={'Accept-Language': lang})
    assert r.status_code == 401
    assert r.json()['detail'] == expected


def test_role_list_is_variable(client, make_user, login):
    headers = login(make_user(UserRole.viewer).username)
    r = client.get('/api/v1/admin/api-keys', headers={**headers, 'Accept-Language': 'es'})
    assert r.status_code == 403
    assert r.json()['detail'] == 'Acceso denegado. Rol requerido: admin'


def test_login_error_translated(client, make_user):
    user = make_user(UserRole.admin)
    r = client.post('/api/v1/auth/login', headers={'Accept-Language': 'de'},
                    json={'username': user.username, 'password': 'wrong-password'})
    assert r.status_code == 401
    assert r.json()['detail'] == 'Benutzername oder Passwort falsch.'


# ── Meta + settings ───────────────────────────────────────────────

def test_meta_public(client):
    r = client.get('/api/v1/meta')
    assert r.status_code == 200
    assert r.json() == {'default_lang': 'en', 'languages': ['de', 'en', 'fr', 'es']}


def test_default_lang_from_env(client, monkeypatch):
    monkeypatch.setattr(get_settings(), 'default_lang', 'es')
    assert client.get('/api/v1/meta').json()['default_lang'] == 'es'


def test_admin_settings_get_put(client, make_user, login, db):
    admin = make_user(UserRole.admin)
    headers = login(admin.username)
    assert client.get('/api/v1/admin/settings', headers=headers).json() == {'default_lang': 'en'}

    r = client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': 'fr'})
    assert r.status_code == 200 and r.json() == {'default_lang': 'fr'}
    assert client.get('/api/v1/admin/settings', headers=headers).json() == {'default_lang': 'fr'}
    assert client.get('/api/v1/meta').json()['default_lang'] == 'fr'

    log = db.query(AuditLog).filter_by(action='settings_update').one()
    assert log.actor_id == admin.id and 'fr' in log.reason

    r = client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': 'de'})
    assert r.json() == {'default_lang': 'de'}
    assert client.get('/api/v1/meta').json()['default_lang'] == 'de'


@pytest.mark.parametrize('value', ['xx', 'DE', 'de-DE', '', None])
def test_admin_settings_invalid_lang(client, make_user, login, value):
    headers = login(make_user(UserRole.admin).username)
    r = client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': value})
    assert r.status_code == 422


@pytest.mark.parametrize('role', [r for r in UserRole if r != UserRole.admin])
def test_admin_settings_rbac(client, make_user, login, role):
    headers = login(make_user(role).username)
    assert client.get('/api/v1/admin/settings', headers=headers).status_code == 403
    assert client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': 'fr'}).status_code == 403


def test_admin_settings_requires_auth(client):
    assert client.get('/api/v1/admin/settings').status_code == 401
    assert client.put('/api/v1/admin/settings', json={'default_lang': 'fr'}).status_code == 401


# ── Setup wizard ──────────────────────────────────────────────────

def test_setup_settings_without_token_file(client):
    r = client.post('/api/v1/setup/settings', json={'token': TOKEN, 'default_lang': 'fr'})
    assert r.status_code == 403


def test_setup_settings_token_gated(client, token_file):  # noqa: F811
    r = client.post('/api/v1/setup/settings', json={'token': 'wrong', 'default_lang': 'fr'})
    assert r.status_code == 401
    assert client.get('/api/v1/meta').json()['default_lang'] == 'en'

    r = client.post('/api/v1/setup/settings', json={'token': TOKEN, 'default_lang': 'xx'})
    assert r.status_code == 422

    r = client.post('/api/v1/setup/settings', json={'token': TOKEN, 'default_lang': 'fr'})
    assert r.status_code == 200 and r.json() == {'default_lang': 'fr'}
    assert client.get('/api/v1/meta').json()['default_lang'] == 'fr'


# ── Extension ─────────────────────────────────────────────────────

def test_config_includes_default_lang(client, api_key, make_user, login):
    raw, _key = api_key
    r = client.get('/api/v1/config', headers={'X-API-Key': raw})
    assert r.status_code == 200 and r.json()['default_lang'] == 'en'

    headers = login(make_user(UserRole.admin).username)
    client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': 'es'})
    assert client.get('/api/v1/config', headers={'X-API-Key': raw}).json()['default_lang'] == 'es'


def _build_lang(client, headers, key_id, **extra):
    r = client.post('/api/v1/admin/build-extension', headers=headers,
                    json={'key_id': key_id, 'server_url': 'https://ps.example.com', **extra})
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        config = zf.read('extension/config.js').decode()
    return re.search(r'lang:\s*"([a-z]+)"', config).group(1), r.headers['content-disposition']


def test_build_extension_lang(client, make_user, login):
    headers = login(make_user(UserRole.admin).username)
    base = client.post('/api/v1/admin/api-keys', headers=headers, json={'name': 'Lang'}).json()

    assert _build_lang(client, headers, base['id'])[0] == 'en'

    client.put('/api/v1/admin/settings', headers=headers, json={'default_lang': 'fr'})
    lang, disposition = _build_lang(client, headers, base['id'])
    assert lang == 'fr' and 'pastegate-extension-fr.zip' in disposition

    assert _build_lang(client, headers, base['id'], lang='es')[0] == 'es'
    assert _build_lang(client, headers, base['id'], lang=None)[0] == 'fr'

    r = client.post('/api/v1/admin/build-extension', headers=headers,
                    json={'key_id': base['id'], 'lang': 'it'})
    assert r.status_code == 422


# ── Catalogs ──────────────────────────────────────────────────────

def _load(lang):
    return json.loads((LOCALES / f'{lang}.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('lang', SUPPORTED_LANGS)
def test_locale_keys_match_en(lang):
    en, other = _load('en'), _load(lang)
    assert set(other) == set(en), {'missing': set(en) - set(other), 'extra': set(other) - set(en)}
    for key, msg in other.items():
        assert msg.strip(), f'{lang}:{key} leer'
        # Placeholders must be identical
        assert set(re.findall(r'\{(\w+)\}', msg)) == set(re.findall(r'\{(\w+)\}', en[key])), f'{lang}:{key}'


def test_no_orphan_locale_files():
    assert {p.stem for p in LOCALES.glob('*.json')} == set(SUPPORTED_LANGS)


_KEY_RE = re.compile(r"""(?<![\w.])(?:_|translate)\(\s*['"]([^'"]+)['"]""")


def test_all_used_keys_exist():
    en = _load('en')
    used = set()
    for path in APP_DIR.rglob('*.py'):
        used |= set(_KEY_RE.findall(path.read_text(encoding='utf-8')))
    assert used, 'no _() calls found'
    assert used - set(en) == set()


def test_gettext_alias_not_shadowed():
    # A local binding of "_" (e.g. "a, _ = ...") would break _() in the whole function.
    for path in APP_DIR.rglob('*.py'):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        if not any(isinstance(n, ast.ImportFrom) and n.module == 'app.core.i18n'
                   and any(a.name == '_' for a in n.names) for n in ast.walk(tree)):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == '_' and isinstance(node.ctx, ast.Store):
                pytest.fail(f'{path.name}:{node.lineno} bindet "_" lokal')


def test_login_rate_limit_message_translated(client):
    body = {'username': 'nobody', 'password': 'x'}
    for _i in range(10):
        client.post('/api/v1/auth/login', json=body)
    r = client.post('/api/v1/auth/login', json=body, headers={'Accept-Language': 'fr-CA'})
    assert r.status_code == 429
    assert r.json()['detail'] == 'Trop de tentatives de connexion. Veuillez patienter 60 secondes.'
    assert r.headers['content-language'] == 'fr'
