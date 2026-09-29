from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_device_id
from app.models.models import AuditLog, Device, UserRole

IDENTITY = 'jane.doe@example.com'


def _ingest(client, api_key, identity=IDENTITY):
    raw, _ = api_key
    body = {
        'device_id': 'device-uuid-ident',
        'identity': identity,
        'events': [{
            'ts': datetime.now(timezone.utc).isoformat(),
            'url_hash': 'a' * 64,
            'host': 'chat.example.com',
            'action': 'blocked',
            'findings': [{'rule_id': 'aws_access_key', 'severity': 'critical'}],
        }],
    }
    r = client.post('/api/v1/events/batch', json=body, headers={'X-API-Key': raw})
    assert r.status_code == 202, r.text
    return db_device()


def db_device():
    with SessionLocal() as s:
        return s.scalar(select(Device).where(Device.device_hash == hash_device_id('device-uuid-ident')))


def test_identity_stored_encrypted(client, api_key):
    device = _ingest(client, api_key)
    assert device.identity_enc
    assert IDENTITY not in device.identity_enc


@pytest.mark.parametrize('role', [UserRole.itsec, UserRole.infosec, UserRole.admin])
def test_lists_never_contain_identity(client, make_user, login, api_key, role):
    _ingest(client, api_key)
    headers = login(make_user(role).username)

    devices = client.get('/api/v1/admin/devices', headers=headers).json()
    assert devices[0]['has_identity'] is True
    events = client.get('/api/v1/admin/events', headers=headers).json()
    assert events['items'][0]['device_has_identity'] is True
    assert IDENTITY not in str(devices) + str(events)


@pytest.mark.parametrize('role', [UserRole.itsec, UserRole.infosec])
def test_view_identity_is_audited(client, db, make_user, login, api_key, role):
    device = _ingest(client, api_key)
    user = make_user(role)
    r = client.post(f'/api/v1/admin/devices/{device.id}/identity', headers=login(user.username))
    assert r.status_code == 200, r.text
    assert r.json() == {'device_hash': device.device_hash, 'identity': IDENTITY}

    log = db.scalars(select(AuditLog).where(AuditLog.action == 'identity_viewed')).one()
    assert log.actor_id == user.id
    assert log.target_hash == device.device_hash


@pytest.mark.parametrize('role', [r for r in UserRole if r not in (UserRole.itsec, UserRole.infosec)])
def test_view_identity_forbidden_for_other_roles(client, db, make_user, login, api_key, role):
    device = _ingest(client, api_key)
    r = client.post(f'/api/v1/admin/devices/{device.id}/identity', headers=login(make_user(role).username))
    assert r.status_code == 403
    assert IDENTITY not in r.text
    assert db.scalars(select(AuditLog).where(AuditLog.action == 'identity_viewed')).first() is None


def test_view_identity_unknown_device(client, make_user, login):
    r = client.post('/api/v1/admin/devices/00000000-0000-0000-0000-000000000000/identity',
                    headers=login(make_user(UserRole.itsec).username))
    assert r.status_code == 404


def test_identity_update_and_missing(client, make_user, login, api_key):
    _ingest(client, api_key)
    first = db_device().identity_enc
    _ingest(client, api_key)                      # same identity → do not re-encrypt
    assert db_device().identity_enc == first
    _ingest(client, api_key, identity=None)       # old extension → identity is kept
    assert db_device().identity_enc == first

    r = client.post(f'/api/v1/admin/devices/{db_device().id}/identity',
                    headers=login(make_user(UserRole.itsec).username))
    assert r.json()['identity'] == IDENTITY


def test_device_without_identity(client, db, make_user, login):
    device = Device(device_hash='a' * 64)
    db.add(device)
    db.commit()
    r = client.post(f'/api/v1/admin/devices/{device.id}/identity',
                    headers=login(make_user(UserRole.infosec).username))
    assert r.status_code == 200
    assert r.json()['identity'] is None


def test_audit_log_shows_names(client, db, make_user, login, api_key):
    device = _ingest(client, api_key)
    viewer = make_user(UserRole.itsec, username='anna.itsec')
    approver = make_user(UserRole.infosec, username='bernd.infosec')
    client.post(f'/api/v1/admin/devices/{device.id}/identity', headers=login(viewer.username))
    # Legacy entry from the former four-eyes procedure
    db.add(AuditLog(actor_id=viewer.id, approver_id=approver.id, action='resolve_approved',
                    target_hash=device.device_hash, reason='Altbestand'))
    db.commit()

    dp = make_user(UserRole.dataprivacy)
    logs = client.get('/api/v1/admin/audit-log', headers=login(dp.username)).json()
    by_action = {l['action']: l for l in logs}
    assert by_action['identity_viewed']['actor_name'] == 'anna.itsec'
    assert by_action['identity_viewed']['approver_name'] is None
    assert by_action['resolve_approved']['actor_name'] == 'anna.itsec'
    assert by_action['resolve_approved']['approver_name'] == 'bernd.infosec'
    assert IDENTITY not in str(logs)
