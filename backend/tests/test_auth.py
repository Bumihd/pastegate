import pyotp

from app.api.auth import TOTP_MAX_ATTEMPTS
from app.main import RATE_LIMIT_MAX
from app.models.models import User

from .conftest import PASSWORD


def test_login_wrong_password(client, make_user):
    user = make_user()
    r = client.post('/api/v1/auth/login', json={'username': user.username, 'password': 'nope'})
    assert r.status_code == 401


def test_login_and_me(client, make_user, login):
    user = make_user()
    headers = login(user.username)
    r = client.get('/api/v1/auth/me', headers=headers)
    assert r.status_code == 200
    assert r.json()['username'] == user.username


def test_inactive_user_cannot_login(client, make_user):
    user = make_user(is_active=False)
    r = client.post('/api/v1/auth/login', json={'username': user.username, 'password': PASSWORD})
    assert r.status_code == 401


def test_logout_revokes_token(client, make_user, login):
    user = make_user()
    headers = login(user.username)
    assert client.post('/api/v1/auth/logout', headers=headers).status_code == 204
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401


def test_tampered_token_rejected(client, make_user, login):
    user = make_user()
    headers = login(user.username)
    headers['Authorization'] = headers['Authorization'][:-2] + 'xx'
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401


def test_login_rate_limit(client, make_user):
    user = make_user()
    body = {'username': user.username, 'password': 'wrong'}
    codes = [client.post('/api/v1/auth/login', json=body).status_code for _ in range(RATE_LIMIT_MAX + 1)]
    assert codes[:RATE_LIMIT_MAX] == [401] * RATE_LIMIT_MAX
    assert codes[-1] == 429


def test_totp_required_and_verified(client, make_user):
    secret = pyotp.random_base32()
    user = make_user(totp_secret=secret, totp_enabled=True)
    base = {'username': user.username, 'password': PASSWORD}

    r = client.post('/api/v1/auth/login', json=base)
    assert r.status_code == 200 and r.json()['totp_required'] is True and r.json()['access_token'] == ''

    r = client.post('/api/v1/auth/login', json={**base, 'totp_code': pyotp.TOTP(secret).now()})
    assert r.status_code == 200 and r.json()['access_token']


def test_totp_lockout_is_persisted(client, make_user, db):
    secret = pyotp.random_base32()
    user = make_user(totp_secret=secret, totp_enabled=True)
    good = pyotp.TOTP(secret).now()
    bad = '000000' if good != '000000' else '111111'
    base = {'username': user.username, 'password': PASSWORD}

    for _ in range(TOTP_MAX_ATTEMPTS):
        assert client.post('/api/v1/auth/login', json={**base, 'totp_code': bad}).status_code == 401

    # Locked – even a valid code does not get through
    r = client.post('/api/v1/auth/login', json={**base, 'totp_code': good})
    assert r.status_code == 429

    # The lock lives in the DB (so it applies to all workers)
    db.expire_all()
    stored = db.get(User, user.id)
    assert stored.totp_failed_attempts >= TOTP_MAX_ATTEMPTS
    assert stored.totp_locked_until is not None


def test_change_password_revokes_current_token(client, make_user, login):
    user = make_user()
    headers = login(user.username)
    r = client.post('/api/v1/auth/change-password', headers=headers,
                    json={'current_password': PASSWORD, 'new_password': 'an-even-longer-passphrase'})
    assert r.status_code == 204
    assert client.get('/api/v1/auth/me', headers=headers).status_code == 401
    login(user.username, 'an-even-longer-passphrase')


def test_password_hash_compat_and_long_passwords():
    from app.core.security import hash_password, verify_password
    long_pw = 'ä' * 100  # 200 bytes of UTF-8
    h = hash_password(long_pw)
    assert verify_password(long_pw, h)
    assert not verify_password('wrong', h)
    assert not verify_password('x', 'not-a-bcrypt-hash')
    # Existing hashes (bcrypt < 5 silently truncated to 72 bytes) remain valid
    import bcrypt
    legacy = bcrypt.hashpw(long_pw.encode()[:72], bcrypt.gensalt()).decode()
    assert verify_password(long_pw, legacy)
