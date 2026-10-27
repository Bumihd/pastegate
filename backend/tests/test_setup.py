import importlib.util
import os

import pyotp
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api import setup as setup_api
from app.core.database import engine
from app.core.security import hash_api_key
from app.main import RATE_LIMIT_MAX
from app.models.models import ApiKey, SetupState, User, UserRole

TOKEN = 'setup-token-' + 'c' * 40
ADMIN = {'username': 'root-admin', 'email': 'admin@example.com', 'password': 'a-very-long-password'}


@pytest.fixture
def token_file():
    path = setup_api._TOKEN_CANDIDATES[0]
    with open(path, 'w') as f:
        f.write(TOKEN)
    return path


def test_no_token_file_means_no_setup(client):
    r = client.get('/api/v1/setup/status')
    assert r.json() == {'needs_setup': False, 'has_admin': False}
    assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).status_code == 403


def test_wrong_token_rejected(client, token_file):
    assert client.get('/api/v1/setup/status').json()['needs_setup'] is True
    assert client.post('/api/v1/setup/verify-token', json={'token': 'wrong'}).status_code == 401
    assert client.post('/api/v1/setup/create-admin', json={'token': 'wrong', **ADMIN}).status_code == 401


def test_full_wizard(client, token_file, db):
    assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).json()['valid'] is True
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201

    secret = client.post('/api/v1/setup/init-totp', json={'token': TOKEN}).json()['secret']
    r = client.post('/api/v1/setup/confirm-totp', json={'token': TOKEN, 'totp_code': pyotp.TOTP(secret).now()})
    assert r.json() == {'totp_enabled': True}

    r = client.post('/api/v1/setup/init-apikey', json={'token': TOKEN})
    raw = r.json()['key']
    stored = db.query(ApiKey).one()
    assert stored.key_hash == hash_api_key(raw) and raw not in stored.key_hash

    assert client.post('/api/v1/setup/complete', json={'token': TOKEN}).json()['ok'] is True
    assert client.get('/api/v1/setup/status').json() == {'needs_setup': False, 'has_admin': True}
    # Setup is locked
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 403

    # Login with 2FA works, the API key is valid
    r = client.post('/api/v1/auth/login', json={'username': ADMIN['username'], 'password': ADMIN['password'],
                                               'totp_code': pyotp.TOTP(secret).now()})
    assert r.status_code == 200 and r.json()['access_token']
    assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 200


def test_second_admin_blocked_even_if_token_remains(client, token_file):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    other = {**ADMIN, 'username': 'intruder', 'email': 'x@example.com'}
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **other}).status_code == 409


# ── Lock after completion (setup_state) ──────────────────────────

def _run_wizard(client) -> None:
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    assert client.post('/api/v1/setup/complete', json={'token': TOKEN}).status_code == 200


POST_CALLS = [
    ('verify-token', {}),
    ('create-admin', {**ADMIN, 'username': 'second'}),
    ('init-totp', {}),
    ('confirm-totp', {'totp_code': '123456'}),
    ('init-apikey', {}),
    ('settings', {'default_lang': 'en'}),
    ('complete', {}),
]


def test_complete_sets_flag_and_removes_token(client, token_file, db):
    _run_wizard(client)
    state = db.get(SetupState, 1)
    assert state.completed is True and state.completed_at is not None
    assert not os.path.exists(token_file)


def test_all_endpoints_locked_even_if_token_file_survives(client, token_file, db):
    _run_wizard(client)
    # Simulates the old bug: the token file could not be removed
    with open(token_file, 'w') as f:
        f.write(TOKEN)
    for path, extra in POST_CALLS:
        r = client.post(f'/api/v1/setup/{path}', json={'token': TOKEN, **extra})
        assert r.status_code == 403, (path, r.status_code)
    assert client.get('/api/v1/setup/status').json() == {'needs_setup': False, 'has_admin': True}
    # Nothing changed: no API key created, still exactly one admin
    assert db.query(ApiKey).count() == 0
    assert db.query(User).filter(User.role == UserRole.admin).count() == 1


def test_legacy_install_without_state_row_is_locked(client, token_file, make_user, db):
    """Admin exists, but setup_state was never written (not migrated yet)."""
    make_user(UserRole.admin)
    assert db.get(SetupState, 1) is None
    assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).status_code == 403
    assert client.post('/api/v1/setup/init-apikey', json={'token': TOKEN}).status_code == 403


@pytest.fixture
def without_setup_state_table():
    """Migration 0010 has not run yet (e.g. container before its first migrate)."""
    table = SetupState.__table__
    table.drop(bind=engine)
    yield
    table.create(bind=engine)


def test_lock_holds_without_setup_state_table(client, token_file, make_user, without_setup_state_table):
    make_user(UserRole.admin)
    for path, extra in POST_CALLS:
        r = client.post(f'/api/v1/setup/{path}', json={'token': TOKEN, **extra})
        assert r.status_code == 403, (path, r.status_code)
    assert client.get('/api/v1/setup/status').json() == {'needs_setup': False, 'has_admin': True}


def test_fresh_install_without_setup_state_table_stays_token_gated(client, token_file, without_setup_state_table):
    assert client.get('/api/v1/setup/status').json()['needs_setup'] is True
    assert client.post('/api/v1/setup/verify-token', json={'token': 'wrong'}).status_code == 401
    assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).status_code == 200


def test_wizard_stays_open_between_create_admin_and_complete(client, token_file, db):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    assert db.get(SetupState, 1).completed is False
    assert client.post('/api/v1/setup/init-apikey', json={'token': TOKEN}).status_code == 201


def test_complete_fails_without_200_if_flag_cannot_be_stored(client, token_file, monkeypatch, db):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201

    def broken_commit(self):
        raise SQLAlchemyError('simulated')
    monkeypatch.setattr(Session, 'commit', broken_commit)
    r = client.post('/api/v1/setup/complete', json={'token': TOKEN})
    monkeypatch.undo()

    assert r.status_code == 500
    assert os.path.exists(token_file)  # the token is only removed after the flag is stored
    db.expire_all()
    assert db.get(SetupState, 1).completed is False


# ── Rate limit ────────────────────────────────────────────────────

def test_setup_rate_limit_counts_failed_token_checks(client, token_file):
    codes = [client.post('/api/v1/setup/verify-token', json={'token': 'wrong'}).status_code
             for _ in range(RATE_LIMIT_MAX + 1)]
    assert codes[:RATE_LIMIT_MAX] == [401] * RATE_LIMIT_MAX
    assert codes[-1] == 429
    # Blocked for the correct token too – otherwise 429 vs. 200 reveals a hit
    assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).status_code == 429
    # status stays reachable (the dashboard calls it on every page load)
    assert client.get('/api/v1/setup/status').status_code == 200


def test_successful_setup_steps_do_not_count(client, token_file):
    for _ in range(RATE_LIMIT_MAX + 2):
        assert client.post('/api/v1/setup/verify-token', json={'token': TOKEN}).status_code == 200
    # A few typos on top still get a 401, not a 429
    for _ in range(RATE_LIMIT_MAX - 1):
        assert client.post('/api/v1/setup/verify-token', json={'token': 'wrong'}).status_code == 401
    _run_wizard(client)


def test_setup_and_login_buckets_are_separate(client, token_file, make_user):
    for _ in range(RATE_LIMIT_MAX + 1):
        client.post('/api/v1/setup/verify-token', json={'token': 'wrong'})
    user = make_user()
    r = client.post('/api/v1/auth/login', json={'username': user.username, 'password': 'wrong'})
    assert r.status_code == 401


# ── Migration 0010 backfill ───────────────────────────────────────

def _run_migration_0010():
    path = os.path.join(os.path.dirname(__file__), '..', 'alembic', 'versions', '0010_setup_state.py')
    spec = importlib.util.spec_from_file_location('m0010', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mod.upgrade()


def test_migration_marks_existing_install_completed(make_user, db):
    make_user(UserRole.admin)
    _run_migration_0010()
    state = db.get(SetupState, 1)
    assert state.completed is True and state.completed_at is not None


def test_migration_leaves_fresh_install_open(make_user, db):
    make_user(UserRole.itsec)
    make_user(UserRole.admin, is_active=False)
    _run_migration_0010()
    assert db.get(SetupState, 1) is None


# ── Abandoned wizard: first admin login locks setup (F3) ─────────

def test_admin_login_locks_abandoned_wizard(client, token_file, db):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    # Wizard abandoned here – no /complete. The admin logs in normally.
    r = client.post('/api/v1/auth/login', json={'username': ADMIN['username'], 'password': ADMIN['password']})
    assert r.status_code == 200 and r.json()['access_token']

    state = db.get(SetupState, 1)
    db.refresh(state)
    assert state.completed is True and state.completed_at is not None
    assert not os.path.exists(token_file)
    with open(token_file, 'w') as f:      # even if the file came back
        f.write(TOKEN)
    for path, extra in POST_CALLS:
        r = client.post(f'/api/v1/setup/{path}', json={'token': TOKEN, **extra})
        assert r.status_code == 403, (path, r.status_code)


def test_non_admin_login_does_not_lock_setup(client, token_file, make_user, login, db):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    viewer = make_user(UserRole.viewer)
    login(viewer.username)
    assert db.get(SetupState, 1).completed is False
    assert client.post('/api/v1/setup/init-apikey', json={'token': TOKEN}).status_code == 201


def test_setup_cannot_replace_active_2fa(client, token_file, db):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    secret = client.post('/api/v1/setup/init-totp', json={'token': TOKEN}).json()['secret']
    r = client.post('/api/v1/setup/confirm-totp', json={'token': TOKEN, 'totp_code': pyotp.TOTP(secret).now()})
    assert r.status_code == 200

    assert client.post('/api/v1/setup/init-totp', json={'token': TOKEN}).status_code == 409
    r = client.post('/api/v1/setup/confirm-totp', json={'token': TOKEN, 'totp_code': pyotp.TOTP(secret).now()})
    assert r.status_code == 409
    admin = db.query(User).filter(User.role == UserRole.admin).one()
    assert admin.totp_enabled is True and admin.totp_secret == secret


# ── Forwarded headers and the setup rate limit (F4) ──────────────
# uvicorn's ProxyHeadersMiddleware with the trust setting the installer writes
# into FORWARDED_ALLOW_IPS. The TestClient connects as host 'testclient'.

def _client_behind(trusted_hosts: str):
    from fastapi.testclient import TestClient
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
    from app.main import app
    return TestClient(ProxyHeadersMiddleware(app, trusted_hosts=trusted_hosts))


def _spoofed_attempts(c) -> list[int]:
    return [c.post('/api/v1/setup/verify-token', json={'token': 'wrong'},
                   headers={'X-Forwarded-For': f'198.51.100.{i}'}).status_code
            for i in range(RATE_LIMIT_MAX + 1)]


def test_untrusted_peer_cannot_spoof_rate_limit_bucket(token_file):
    """The peer is not the trusted proxy: X-Forwarded-For is ignored entirely."""
    with _client_behind('127.0.0.1') as c:
        assert _spoofed_attempts(c)[-1] == 429


def test_trusted_proxy_appended_address_decides_the_bucket(token_file):
    """Trusted proxy in front: only the address it added (rightmost) counts,
    whatever the client put in front of it."""
    with _client_behind('testclient') as c:
        codes = [c.post('/api/v1/setup/verify-token', json={'token': 'wrong'},
                        headers={'X-Forwarded-For': f'198.51.100.{i}, 203.0.113.7'}).status_code
                 for i in range(RATE_LIMIT_MAX + 1)]
        assert codes[-1] == 429
        # another real client behind the same proxy has its own bucket
        r = c.post('/api/v1/setup/verify-token', json={'token': 'wrong'},
                   headers={'X-Forwarded-For': '203.0.113.8'})
        assert r.status_code == 401


def test_trusting_everyone_would_allow_spoofing(token_file):
    """Documents why FORWARDED_ALLOW_IPS must never be '*' (old container default)."""
    with _client_behind('*') as c:
        assert 429 not in _spoofed_attempts(c)


def test_failed_setup_lock_does_not_block_admin_login(client, token_file, monkeypatch, caplog):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201

    def broken(db):
        raise SQLAlchemyError('simulated')
    monkeypatch.setattr(setup_api, '_mark_completed', broken)
    with caplog.at_level('WARNING', logger=setup_api.log.name):
        r = client.post('/api/v1/auth/login', json={'username': ADMIN['username'], 'password': ADMIN['password']})
    assert r.status_code == 200 and r.json()['access_token']
    assert any(getattr(rec, 'event', None) == 'setup_lock_on_login_failed' for rec in caplog.records)


def test_concurrent_admin_logins_do_not_collide():
    """Two logins lock setup at the same time, no setup_state row yet: the second
    insert waits for the first transaction and must not fail."""
    import threading
    from app.core.database import SessionLocal

    errors = []

    # _mark_completed directly: complete_on_admin_login would only log the error
    # (by design), and the race would go unnoticed.
    def second_login():
        try:
            with SessionLocal() as s:
                setup_api._mark_completed(s)
                s.commit()
        except Exception as exc:   # noqa: BLE001 – collected and asserted below
            errors.append(exc)

    with SessionLocal() as first:
        setup_api._mark_completed(first)   # row inserted, not committed
        t = threading.Thread(target=second_login)
        t.start()
        t.join(timeout=1)
        assert t.is_alive(), 'second login should wait for the first transaction'
        first.commit()
    t.join(timeout=10)
    assert not t.is_alive() and errors == []
    with SessionLocal() as s:
        state = s.get(SetupState, 1)
        assert state.completed is True and state.completed_at is not None
