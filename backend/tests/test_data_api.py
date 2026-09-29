from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.security import encrypt_identity
from app.models.models import (
    AccessToken, AuditLog, Device, EventAction, EventFinding, PasteEvent, Severity, UserRole,
    ViewerDeviceAssignment,
)

IDENTITY = 'jane.doe@example.com'


@pytest.fixture
def events(db):
    """Two devices, three events; device A has an encrypted identity."""
    now = datetime.now(timezone.utc)
    a = Device(device_hash='a' * 64, identity_enc=encrypt_identity(IDENTITY), label='Real-Name-Label')
    b = Device(device_hash='b' * 64)
    db.add_all([a, b])
    db.flush()
    for dev, action, host, sev, age in [
        (a, EventAction.blocked, 'chat.example.com', Severity.critical, 0),
        (a, EventAction.allowed, 'chat.example.com', Severity.high, 1),
        (b, EventAction.blocked_hard, 'paste.example.org', Severity.critical, 2),
    ]:
        ev = PasteEvent(device_id=dev.id, ts=now - timedelta(days=age), url_hash='c' * 64,
                        host=host, action=action)
        db.add(ev)
        db.flush()
        db.add(EventFinding(event_id=ev.id, rule_id='aws_access_key', severity=sev))
    db.commit()
    return a, b


def _token(client, headers, **body):
    r = client.post('/api/v1/tokens', json={'name': 'Grafana', **body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def bearer(raw):
    return {'Authorization': f'Bearer {raw}'}


# ── Tokens ────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', list(UserRole))
def test_every_role_can_create_token_and_read_stats(client, make_user, login, events, role):
    raw = _token(client, login(make_user(role).username))['token']
    assert raw.startswith('pgr_')
    r = client.get('/api/v1/data/stats', headers=bearer(raw))
    assert r.status_code == 200, r.text
    stats = r.json()
    assert stats['total_events'] == 3
    assert stats['by_action'] == {'blocked': 1, 'blocked_hard': 1, 'allowed': 1}
    assert stats['active_devices'] == 2
    assert stats['by_severity']['critical'] == 2
    assert stats['top_hosts'][0] == {'host': 'chat.example.com', 'count': 2}
    assert len(stats['trend']) == 30 and stats['trend'][-1]['blocked'] == 1


def test_token_stored_hashed_and_audited(client, db, make_user, login):
    user = make_user(UserRole.management)
    raw = _token(client, login(user.username))['token']
    token = db.scalar(select(AccessToken))
    assert raw not in token.token_hash
    log = db.scalar(select(AuditLog).where(AuditLog.action == 'token_created'))
    assert log.actor_id == user.id and log.reason == 'Grafana'


def test_token_only_works_on_data_api(client, make_user, login):
    raw = _token(client, login(make_user(UserRole.admin).username))['token']
    for path in ('/api/v1/admin/stats', '/api/v1/admin/devices', '/api/v1/tokens', '/api/v1/auth/me'):
        assert client.get(path, headers=bearer(raw)).status_code == 401, path
    assert client.post('/api/v1/tokens', json={'name': 'x'}, headers=bearer(raw)).status_code == 401


def test_revoked_expired_and_inactive_user_rejected(client, db, make_user, login):
    user = make_user(UserRole.itsec)
    headers = login(user.username)
    t1 = _token(client, headers)
    assert client.delete(f"/api/v1/tokens/{t1['id']}", headers=headers).status_code == 204
    assert client.get('/api/v1/data/stats', headers=bearer(t1['token'])).status_code == 401

    t2 = _token(client, headers, expires_in_days=1)
    db.get(AccessToken, t2['id']).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert client.get('/api/v1/data/stats', headers=bearer(t2['token'])).status_code == 401

    t3 = _token(client, headers)
    db.get(type(user), user.id).is_active = False
    db.commit()
    assert client.get('/api/v1/data/stats', headers=bearer(t3['token'])).status_code == 401


def test_tokens_are_private_per_user(client, make_user, login):
    a, b = make_user(UserRole.itsec), make_user(UserRole.itsec)
    t = _token(client, login(a.username))
    hb = login(b.username)
    assert client.get('/api/v1/tokens', headers=hb).json() == []
    assert client.delete(f"/api/v1/tokens/{t['id']}", headers=hb).status_code == 404


def test_token_limit(client, make_user, login):
    headers = login(make_user(UserRole.viewer).username)
    for _ in range(10):
        _token(client, headers)
    assert client.post('/api/v1/tokens', json={'name': 'x'}, headers=headers).status_code == 400


# ── Events ────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', [UserRole.itsec, UserRole.infosec, UserRole.admin])
def test_events_pseudonymous_never_identity(client, make_user, login, events, role):
    raw = _token(client, login(make_user(role).username))['token']
    r = client.get('/api/v1/data/events', headers=bearer(raw))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['total'] == 3
    assert {e['device_hash'] for e in body['items']} == {'a' * 64, 'b' * 64}
    assert IDENTITY not in r.text and 'Real-Name-Label' not in r.text
    assert set(body['items'][0]) == {'id', 'ts', 'device_hash', 'host', 'url_hash', 'action', 'findings'}


def test_events_filters(client, make_user, login, events):
    raw = _token(client, login(make_user(UserRole.itsec).username))['token']
    get = lambda q: client.get(f'/api/v1/data/events?{q}', headers=bearer(raw)).json()
    assert get('action=allowed')['total'] == 1
    assert get('severity=critical')['total'] == 2
    since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat().replace('+', '%2B')
    assert get(f'since={since}')['total'] == 1
    assert len(get('limit=1')['items']) == 1


@pytest.mark.parametrize('role', [UserRole.management, UserRole.dataprivacy])
def test_events_forbidden_for_aggregate_only_roles(client, make_user, login, events, role):
    raw = _token(client, login(make_user(role).username))['token']
    assert client.get('/api/v1/data/events', headers=bearer(raw)).status_code == 403


def test_viewer_sees_only_assigned_devices(client, db, make_user, login, events):
    a, _ = events
    viewer = make_user(UserRole.viewer)
    db.add(ViewerDeviceAssignment(user_id=viewer.id, device_id=a.id))
    db.commit()
    raw = _token(client, login(viewer.username))['token']
    body = client.get('/api/v1/data/events', headers=bearer(raw)).json()
    assert body['total'] == 2
    assert {e['device_hash'] for e in body['items']} == {'a' * 64}


def test_data_api_accepts_dashboard_jwt(client, make_user, login, events):
    headers = login(make_user(UserRole.management).username)
    assert client.get('/api/v1/data/stats?days=7', headers=headers).json()['days'] == 7


def test_data_api_requires_auth(client):
    assert client.get('/api/v1/data/stats').status_code == 401
    assert client.get('/api/v1/data/stats', headers=bearer('pgr_' + '0' * 64)).status_code == 401
