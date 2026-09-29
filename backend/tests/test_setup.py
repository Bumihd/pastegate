import pyotp
import pytest

from app.api import setup as setup_api
from app.core.security import hash_api_key

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
    from app.models.models import ApiKey

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
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code in (403, 409)

    # Login with 2FA works, the API key is valid
    r = client.post('/api/v1/auth/login', json={'username': ADMIN['username'], 'password': ADMIN['password'],
                                               'totp_code': pyotp.TOTP(secret).now()})
    assert r.status_code == 200 and r.json()['access_token']
    assert client.get('/api/v1/health', headers={'X-API-Key': raw}).status_code == 200


def test_second_admin_blocked_even_if_token_remains(client, token_file):
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **ADMIN}).status_code == 201
    other = {**ADMIN, 'username': 'intruder', 'email': 'x@example.com'}
    assert client.post('/api/v1/setup/create-admin', json={'token': TOKEN, **other}).status_code == 409
